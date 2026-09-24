import fs from 'node:fs'
import path from 'node:path'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { config } from './config.js'
import * as comfy from './comfy.js'
import * as llm from './llm.js'
import { getJob, jobDir, listJobs, purgeOlderThan, failInterrupted, removeJob } from './store.js'
import { cancel, events, phaseOf, position, rerun, submit, tokensOf } from './queue.js'
import { FINAL_STEPS, httpError, qualityInfo, resolvePreset } from './presets.js'
import { ratios } from './workflows.js'
import { startWarmup, warm } from './warmup.js'

failInterrupted()

const app = Fastify({ logger: { level: 'info' }, bodyLimit: 60 * 1024 * 1024 })
await app.register(cors, { origin: true })
await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 10 } })

app.addHook('onRequest', async (req) => {
  if (!config.apiKey || !req.url.startsWith('/api/') || req.url.startsWith('/api/health')) return
  const key = req.headers['x-api-key'] ?? new URL(req.url, 'http://x').searchParams.get('key')
  if (key !== config.apiKey) throw httpError(401, 'API key inválida')
})

const view = (job) => job && { ...job, queuePosition: position(job.id), phase: phaseOf(job.id), tokens: tokensOf(job.id) }

app.get('/api/health', async () => {
  const [comfyOk, llmOk] = await Promise.all([comfy.ping().catch(() => false), llm.ping().catch(() => false)])
  return { ok: true, comfy: comfyOk, llm: llmOk, warm: { comfy: comfyOk && warm.comfy, llm: llmOk && warm.llm } }
})

app.get('/api/meta', async () => ({ ratios, quality: qualityInfo, finalSteps: FINAL_STEPS, retentionHours: config.retentionHours }))

app.post('/api/jobs', async (req, reply) => {
  const fields = {}
  const files = []
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      if (!part.mimetype.startsWith('image/')) throw httpError(400, 'Solo se aceptan imágenes')
      files.push({ buffer: await part.toBuffer(), mime: part.mimetype, filename: part.filename })
    } else {
      fields[part.fieldname] = part.value
    }
  }

  const type = String(fields.type ?? '')
  let input = {}
  try { input = fields.params ? JSON.parse(fields.params) : {} } catch { throw httpError(400, 'params no es JSON válido') }
  input.imageCount = files.length

  const preset = resolvePreset(type, input)
  if (files.length < preset.minImages) throw httpError(400, `${type} requiere al menos ${preset.minImages} imagen(es)`)
  if (files.length > preset.maxImages) throw httpError(400, `${type} admite como máximo ${preset.maxImages} imagen(es)`)

  const job = submit({ type, preset, files, consent: !!preset.needsConsent })
  return reply.code(202).send(view(job))
})

app.get('/api/jobs', async () => listJobs().map(view))

app.get('/api/jobs/:id', async (req) => {
  const job = getJob(req.params.id)
  if (!job) throw httpError(404, 'Trabajo no encontrado')
  return view(job)
})

// Deletes finished jobs (and ComfyUI's copies of their files). Queued/running jobs are skipped.
app.post('/api/jobs/delete', async (req) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x) => typeof x === 'string') : []
  if (ids.length === 0) throw httpError(400, 'ids requerido')
  const deleted = ids.filter((id) => removeJob(id))
  return { deleted, skipped: ids.filter((id) => !deleted.includes(id)) }
})

// mode "variant": new seed, same steps. mode "final": same seed and size, FINAL_STEPS steps.
app.post('/api/jobs/:id/rerun', async (req, reply) => {
  const src = getJob(req.params.id)
  if (!src) throw httpError(404, 'Trabajo no encontrado')
  if (src.status !== 'done') throw httpError(409, 'El trabajo todavía no terminó')
  if (!Number.isInteger(src.params.seed)) throw httpError(400, 'Este tipo de trabajo no se puede repetir')
  const mode = req.body?.mode
  if (mode === 'variant') {
    return reply.code(202).send(view(rerun(src.id, { seed: Math.floor(Math.random() * 2 ** 32), steps: src.params.steps })))
  }
  if (mode === 'final') {
    if (src.params.steps >= FINAL_STEPS) throw httpError(409, 'Ya está en calidad final')
    return reply.code(202).send(view(rerun(src.id, { seed: src.params.seed, steps: FINAL_STEPS })))
  }
  throw httpError(400, 'mode debe ser "variant" o "final"')
})

app.delete('/api/jobs/:id', async (req) => {
  if (!getJob(req.params.id)) throw httpError(404, 'Trabajo no encontrado')
  if (!(await cancel(req.params.id))) throw httpError(409, 'El trabajo ya terminó')
  return { ok: true }
})

app.get('/api/jobs/:id/events', (req, reply) => {
  const { id } = req.params
  const job = getJob(id)
  if (!job) throw httpError(404, 'Trabajo no encontrado')

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': req.headers.origin ?? '*',
  })
  const send = (j) => reply.raw.write(`data: ${JSON.stringify(view(j))}\n\n`)
  send(job)
  if (job.status === 'done' || job.status === 'error') return reply.raw.end()

  const onUpdate = (j) => {
    send(j)
    if (j.status === 'done' || j.status === 'error') {
      events.off(id, onUpdate)
      reply.raw.end()
    }
  }
  events.on(id, onUpdate)
  const beat = setInterval(() => reply.raw.write(': ping\n\n'), 15000)
  req.raw.on('close', () => { clearInterval(beat); events.off(id, onUpdate) })
  return reply
})

app.get('/api/files/:id/:name', async (req, reply) => {
  const { id, name } = req.params
  if (!/^[\w.-]+$/.test(id) || !/^(in|out)_\d+\.(png|jpg|webp)$/.test(name)) throw httpError(400, 'Archivo inválido')
  const file = path.join(jobDir(id), name)
  if (!fs.existsSync(file)) throw httpError(404, 'Archivo no encontrado')
  const mime = name.endsWith('.jpg') ? 'image/jpeg' : name.endsWith('.webp') ? 'image/webp' : 'image/png'
  return reply.type(mime).header('Cache-Control', 'private, max-age=3600').send(fs.createReadStream(file))
})

app.setErrorHandler((err, req, reply) => {
  const status = err.statusCode ?? 500
  if (status >= 500) req.log.error(err)
  reply.code(status).send({ error: err.message })
})

setInterval(() => {
  const n = purgeOlderThan(config.retentionHours)
  if (n) app.log.info(`Retención: ${n} trabajos eliminados`)
}, 60 * 60 * 1000).unref()

// Production: the built web app is served from the same origin as the API.
if (fs.existsSync(path.join(config.webDir, 'index.html'))) {
  await app.register(fastifyStatic, { root: config.webDir })
}

await app.listen({ port: config.port, host: '0.0.0.0' })
startWarmup(app.log)
