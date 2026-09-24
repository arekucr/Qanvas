import { randomUUID } from 'node:crypto'
import { config } from './config.js'

const base = config.comfyUrl

async function json(res) {
  const text = await res.text()
  if (!res.ok) throw new Error(`ComfyUI ${res.status}: ${text.slice(0, 1500)}`)
  return JSON.parse(text)
}

export async function uploadImage(buffer, filename, mime = 'image/png') {
  const form = new FormData()
  form.append('image', new Blob([buffer], { type: mime }), filename)
  form.append('type', 'input')
  form.append('overwrite', 'true')
  const r = await json(await fetch(`${base}/upload/image`, { method: 'POST', body: form }))
  return r.subfolder ? `${r.subfolder}/${r.name}` : r.name
}

export async function queuePrompt(graph, clientId) {
  const res = await fetch(`${base}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: graph, client_id: clientId }),
  })
  return json(res)
}

export async function history(promptId) {
  const h = await json(await fetch(`${base}/history/${promptId}`))
  return h[promptId]
}

export async function fetchView({ filename, subfolder = '', type = 'output' }) {
  const qs = new URLSearchParams({ filename, subfolder, type })
  const res = await fetch(`${base}/view?${qs}`)
  if (!res.ok) throw new Error(`ComfyUI /view ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function queueInfo() {
  return json(await fetch(`${base}/queue`))
}

export async function interrupt(promptId) {
  await fetch(`${base}/interrupt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(promptId ? { prompt_id: promptId } : {}),
  })
}

// Unloads ComfyUI's models from VRAM (single-GPU mode, before the prompt enhancer runs).
export async function freeMemory() {
  await fetch(`${base}/free`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unload_models: true, free_memory: true }),
  })
}

export async function systemStats() {
  return json(await fetch(`${base}/system_stats`, { signal: AbortSignal.timeout(3000) }))
}

export async function ping() {
  const res = await fetch(`${base}/system_stats`, { signal: AbortSignal.timeout(3000) })
  return res.ok
}

// Runs a graph and resolves with the history entry. onStart fires when ComfyUI actually begins
// this prompt (it may wait behind other prompts), onNode for each executed node id.
export function runGraph(graph, { onProgress, onQueued, onStart, onNode, onCached } = {}) {
  const clientId = randomUUID()
  const wsUrl = base.replace(/^http/, 'ws') + `/ws?clientId=${clientId}`
  return new Promise((resolve, reject) => {
    let promptId = null
    let settled = false
    const ws = new WebSocket(wsUrl)
    const timer = setTimeout(() => finish(new Error('Job timed out')), config.jobTimeoutMs)

    const finish = async (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { ws.close() } catch {}
      if (err) return reject(err)
      try {
        const entry = await history(promptId)
        const st = entry?.status
        if (st?.status_str === 'error') {
          const msg = st.messages?.find((m) => m[0] === 'execution_error')?.[1]
          return reject(new Error(msg?.exception_message ?? 'ComfyUI execution error'))
        }
        resolve(entry)
      } catch (e) {
        reject(e)
      }
    }

    ws.addEventListener('error', () => finish(new Error('WebSocket to ComfyUI failed')))
    ws.addEventListener('open', async () => {
      try {
        const r = await queuePrompt(graph, clientId)
        promptId = r.prompt_id
        onQueued?.(promptId)
      } catch (e) {
        finish(e)
      }
    })
    ws.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string') return
      let msg
      try { msg = JSON.parse(ev.data) } catch { return }
      const d = msg.data ?? {}
      if (d.prompt_id && promptId && d.prompt_id !== promptId) return
      if (msg.type === 'progress') onProgress?.(d.value, d.max)
      else if (msg.type === 'execution_start') onStart?.()
      else if (msg.type === 'execution_cached') onCached?.(d.nodes ?? [])
      else if (msg.type === 'executing' && d.node != null) onNode?.(d.node)
      else if (msg.type === 'executing' && d.node === null) finish()
      else if (msg.type === 'execution_success') finish()
      else if (msg.type === 'execution_error') finish(new Error(d.exception_message ?? 'ComfyUI execution error'))
      else if (msg.type === 'execution_interrupted') finish(new Error('Cancelado'))
    })
  })
}
