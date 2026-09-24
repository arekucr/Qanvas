import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import * as comfy from './comfy.js'
import * as llm from './llm.js'
import { buildGraph, extractOutputs } from './workflows.js'
import { config } from './config.js'
import { getJob, insertJob, jobDir, updateJob } from './store.js'

export const events = new EventEmitter()
events.setMaxListeners(0)

const publish = (job) => job && events.emit(job.id, job)

// Live, in-memory stage of each running job, shown by the UI instead of a bare percentage.
const phases = new Map()
const tokenCounts = new Map()
// Per-job timeline of [phase, timestamp] used to build the "generation details" panel.
const timelines = new Map()
export const phaseOf = (id) => phases.get(id) ?? null
export const tokensOf = (id) => tokenCounts.get(id) ?? null

function setPhase(id, phase, patch = {}) {
  if (phases.get(id) !== phase) timelines.get(id)?.push([phase, Date.now()])
  phases.set(id, phase)
  publish(updateJob(id, patch))
}

const PHASE_BY_NODE = {
  UNETLoader: 'loading',
  CLIPLoader: 'loading',
  VAELoader: 'loading',
  QwenImage21Cache: 'loading',
  LoadImage: 'images',
  TextEncodeQwenImage21: 'encoding',
  KSampler: 'sampling',
  VAEDecode: 'decoding',
  SaveImageAdvanced: 'saving',
  UpscaleModelLoader: 'loading',
  ImageUpscaleWithModel: 'upscaling',
}

// Each lane owns one GPU and runs its jobs one at a time. With a single shared GPU everything
// goes through the ComfyUI lane, so the enhancer never runs while an image is generating.
const lanes = {
  comfy: { pending: [], running: null, stop: null, execute: executeComfy },
  llm: { pending: [], running: null, stop: null, execute: executeLlm },
}
const laneFor = (workflow) => (workflow.startsWith('llm_') && !config.sharedGpu ? lanes.llm : lanes.comfy)

export function position(id) {
  for (const lane of Object.values(lanes)) {
    if (lane.running === id) return 0
    const i = lane.pending.indexOf(id)
    if (i !== -1) return i + 1 + (lane.running ? 1 : 0)
  }
  return null
}

export async function cancel(id) {
  for (const lane of Object.values(lanes)) {
    const i = lane.pending.indexOf(id)
    if (i !== -1) {
      lane.pending.splice(i, 1)
      publish(updateJob(id, { status: 'error', error: 'Cancelado' }))
      return true
    }
    if (lane.running === id) {
      await lane.stop?.()
      return true
    }
  }
  return false
}

// files: [{ buffer, mime }]
export function submit({ type, preset, files, consent }) {
  const id = randomUUID()
  insertJob({ id, type, params: { ...preset.params, workflow: preset.workflow }, consent })
  const dir = jobDir(id)
  files.forEach((f, i) => fs.writeFileSync(path.join(dir, `in_${i}${extOf(f)}`), f.buffer))
  const lane = laneFor(preset.workflow)
  lane.pending.push(id)
  pump(lane)
  return getJob(id)
}

// Re-runs a finished job with the same inputs and prompt, changing only seed and/or steps.
export function rerun(sourceId, { seed, steps }) {
  const src = getJob(sourceId)
  const id = randomUUID()
  insertJob({ id, type: src.type, params: { ...src.params, seed, steps, rerunOf: sourceId }, consent: src.consent })
  const srcDir = jobDir(sourceId)
  for (const f of fs.readdirSync(srcDir).filter((n) => n.startsWith('in_'))) {
    fs.copyFileSync(path.join(srcDir, f), path.join(jobDir(id), f))
  }
  const lane = laneFor(src.params.workflow)
  lane.pending.push(id)
  pump(lane)
  return getJob(id)
}

const extOf = (f) => (f.mime === 'image/jpeg' ? '.jpg' : f.mime === 'image/webp' ? '.webp' : '.png')

// Runs an internal task (e.g. model warm-up) on a lane, ahead of queued jobs.
export function runExclusive(laneName, task) {
  const lane = lanes[laneName]
  return new Promise((resolve, reject) => {
    lane.pending.unshift({ task, resolve, reject })
    pump(lane)
  })
}

// Collapses the timeline into per-phase durations, in order of first appearance.
function phaseTimings(timeline, end) {
  const totals = new Map()
  timeline.forEach(([phase, t], i) => {
    const next = timeline[i + 1]?.[1] ?? end
    totals.set(phase, (totals.get(phase) ?? 0) + (next - t))
  })
  return [...totals].map(([phase, ms]) => ({ phase, ms }))
}

function baseMeta(id, startedAt, end) {
  const job = getJob(id)
  return {
    queueMs: startedAt - job.createdAt,
    runMs: end - startedAt,
    totalMs: end - job.createdAt,
    phases: phaseTimings(timelines.get(id) ?? [], end),
  }
}

async function pump(lane) {
  if (lane.running || lane.pending.length === 0) return
  const next = lane.pending.shift()
  if (typeof next === 'object') {
    lane.running = 'internal'
    try {
      next.resolve(await next.task())
    } catch (err) {
      next.reject(err)
    } finally {
      lane.running = null
      setImmediate(() => pump(lane))
    }
    return
  }
  const id = (lane.running = next)
  const startedAt = Date.now()
  timelines.set(id, [])
  const details = {}
  try {
    publish(updateJob(id, { status: 'running', progress: 0 }))
    const result = await lane.execute(id, lane, details)
    const meta = { ...baseMeta(id, startedAt, Date.now()), ...details }
    publish(updateJob(id, { status: 'done', progress: 1, result: { ...result, meta } }))
  } catch (err) {
    const meta = { ...baseMeta(id, startedAt, Date.now()), ...details }
    publish(updateJob(id, { status: 'error', error: err.name === 'AbortError' ? 'Cancelado' : err.message, result: { meta } }))
  } finally {
    phases.delete(id)
    tokenCounts.delete(id)
    timelines.delete(id)
    lane.running = null
    lane.stop = null
    setImmediate(() => pump(lane))
  }
}

const pngSize = (buf) => (buf.length > 24 && buf.readUInt32BE(12) === 0x49484452 ? { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) } : null)

// What the graph actually used: model files and sampler settings.
function graphDetails(graph) {
  const nodes = Object.values(graph)
  const input = (type, key) => nodes.find((n) => n.class_type === type)?.inputs?.[key]
  const sampler = nodes.find((n) => n.class_type === 'KSampler')?.inputs
  const encoder = nodes.find((n) => n.class_type === 'TextEncodeQwenImage21')?.inputs
  return {
    models: Object.fromEntries(
      [
        ['difusión', input('UNETLoader', 'unet_name')],
        ['text encoder', input('CLIPLoader', 'clip_name')],
        ['VAE', input('VAELoader', 'vae_name')],
        ['upscaler', input('UpscaleModelLoader', 'model_name')],
      ].filter(([, v]) => v),
    ),
    sampler: sampler && {
      seed: sampler.seed,
      steps: sampler.steps,
      cfg: sampler.cfg,
      sampler: sampler.sampler_name,
      scheduler: sampler.scheduler,
      denoise: sampler.denoise,
    },
    promptSent: encoder?.prompt,
    encodeResolution: encoder?.resolution,
  }
}

async function executeComfy(id, lane, details) {
  const job = getJob(id)
  const dir = jobDir(id)
  const inputs = fs.readdirSync(dir).filter((f) => f.startsWith('in_')).sort()

  setPhase(id, 'uploading')
  const uploaded = []
  details.inputs = []
  for (const f of inputs) {
    // Name by content: identical images keep the same LoadImage input, so ComfyUI's cache
    // can skip re-encoding them when a prompt is retried.
    const buf = fs.readFileSync(path.join(dir, f))
    const name = `${createHash('sha256').update(buf).digest('hex').slice(0, 24)}${path.extname(f)}`
    uploaded.push(await comfy.uploadImage(buf, name))
    details.inputs.push({ bytes: buf.length, ...(pngSize(buf) ?? {}) })
  }

  details.comfyFiles = { inputs: uploaded, outputs: [] }

  const { workflow, ...params } = job.params
  const { graph, entry } = buildGraph(workflow, params, uploaded)
  Object.assign(details, graphDetails(graph))

  setPhase(id, 'waiting')
  const history = await comfy.runGraph(graph, {
    onQueued: (promptId) => {
      details.comfyPromptId = promptId
      lane.stop = () => comfy.interrupt(promptId)
    },
    onStart: () => setPhase(id, 'loading'),
    onCached: (nodeIds) => {
      details.cached = [...new Set(nodeIds.map((n) => graph[n]?.class_type).filter(Boolean))]
    },
    onNode: (nodeId) => {
      const phase = PHASE_BY_NODE[graph[nodeId]?.class_type]
      if (phase) setPhase(id, phase)
    },
    onProgress: (value, max) => {
      if (phaseOf(id) === 'sampling') publish(updateJob(id, { progress: max ? value / max : 0 }))
    },
  })

  const out = extractOutputs(entry, history)
  const result = { files: [] }
  for (const [i, img] of (out.images ?? []).entries()) {
    const name = `out_${i}.png`
    details.comfyFiles.outputs.push({ filename: img.filename, subfolder: img.subfolder ?? '' })
    const buf = await comfy.fetchView(img)
    fs.writeFileSync(path.join(dir, name), buf)
    result.files.push(name)
    details.output ??= { bytes: buf.length, ...(pngSize(buf) ?? {}) }
  }
  if (result.files.length === 0) throw new Error('ComfyUI no devolvió imágenes')

  const stats = await comfy.systemStats().catch(() => null)
  const dev = stats?.devices?.[0]
  if (dev) details.gpu = { name: dev.name?.replace(/^cuda:\d+\s*/, '').replace(/\s*:.*$/, ''), vramTotal: dev.vram_total, vramFree: dev.vram_free }
  return result
}

// Thinking length varies a lot, so progress is a rough curve over generated tokens.
const TYPICAL_TOKENS = 1500

async function executeLlm(id, lane, details) {
  const job = getJob(id)
  const abort = new AbortController()
  lane.stop = () => abort.abort()
  // "loading" covers the router swapping models and the prompt prefill, until the first token.
  setPhase(id, 'loading')
  let last = 0
  const opts = {
    seed: job.params.seed,
    fast: job.params.fast === true,
    signal: abort.signal,
    onToken: (n) => {
      tokenCounts.set(id, n)
      if (n === 1) return setPhase(id, 'thinking')
      if (n - last < 20) return
      last = n
      publish(updateJob(id, { progress: Math.min(0.95, n / (n + TYPICAL_TOKENS)) }))
    },
  }
  const edit = job.params.workflow === 'llm_edit'
  details.enhancer = {
    model: edit ? llm.MODELS.edit : llm.MODELS.t2i,
    mode: opts.fast ? 'rápido' : 'detallado',
    target: job.params.target ?? 't2i',
  }
  // Single GPU: hand the card to the enhancer, then give it back to ComfyUI.
  if (config.sharedGpu) await comfy.freeMemory().catch(() => {})
  let out
  try {
    out = await runEnhancer(id, job, edit, opts, details)
  } finally {
    if (config.sharedGpu) await llm.unload(details.enhancer.model).catch(() => {})
  }
  const t = out.timings
  if (t) {
    Object.assign(details.enhancer, {
      promptTokens: t.prompt_n,
      promptMs: Math.round(t.prompt_ms),
      cachedTokens: t.cache_n,
      generatedTokens: t.predicted_n,
      generateMs: Math.round(t.predicted_ms),
      tokensPerSecond: Math.round(t.predicted_per_second * 10) / 10,
    })
  }
  details.promptSent = job.params.prompt
  return { text: out.answer }
}

async function runEnhancer(id, job, edit, opts, details) {
  if (!edit) return llm.enhanceT2I(job.params.prompt, opts)
  const dir = jobDir(id)
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('in_')).sort()
  details.inputs = files.map((f) => ({ bytes: fs.statSync(path.join(dir, f)).size }))
  return llm.enhanceEdit(job.params.prompt, files.map((f) => fs.readFileSync(path.join(dir, f)).toString('base64')), opts)
}
