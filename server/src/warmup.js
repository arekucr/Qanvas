import * as comfy from './comfy.js'
import { config } from './config.js'
import * as llm from './llm.js'
import { runExclusive } from './queue.js'
import { buildGraph } from './workflows.js'

// Loads every model once so the first real request doesn't pay the cold-start cost.
export const warm = { comfy: false, llm: false }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function warmComfy(log) {
  const { graph, entry } = buildGraph('t2i', { prompt: 'warm up', width: 256, height: 256, steps: 1, seed: 0 })
  const src = graph[entry.output].inputs.images
  graph[entry.output] = { class_type: 'PreviewImage', inputs: { images: src } }
  const t = Date.now()
  await runExclusive('comfy', () => comfy.runGraph(graph))
  log.info(`Precarga ComfyUI lista en ${Math.round((Date.now() - t) / 1000)} s`)
}

async function warmLlm(log) {
  // Single GPU: don't park the enhancer in VRAM; it loads on demand and unloads after each use.
  if (config.sharedGpu) return log.info('Mejorador en modo GPU compartida: se carga bajo demanda')
  const t = Date.now()
  await runExclusive('llm', () => llm.primeCache())
  log.info(`Precarga del mejorador lista en ${Math.round((Date.now() - t) / 1000)} s`)
}

// Re-warms whenever a backend comes back (e.g. its container restarted and lost the models).
function watch(name, ping, run, log) {
  let up = false
  const tick = async () => {
    const ok = await ping().catch(() => false)
    if (ok && !up) {
      up = true
      warm[name] = false
      try {
        await run(log)
        warm[name] = true
      } catch (err) {
        log.warn(`Precarga de ${name} falló: ${err.message}`)
        up = false
      }
    } else if (!ok && up) {
      up = false
      warm[name] = false
    }
    await sleep(10000)
    tick()
  }
  tick()
}

export function startWarmup(log) {
  watch('comfy', comfy.ping, warmComfy, log)
  watch('llm', llm.ping, warmLlm, log)
}
