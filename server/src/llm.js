import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

// Model names are the section names in llm/presets.ini (llama.cpp router mode). PE-I2I also writes good
// text-to-image prompts, and PE-T2I + PE-I2I don't fit together on an 8 GB card: using one model for both
// tasks avoids a 10–90 s model swap every time the user switches between Generate and the photo pages.
export const MODELS = { t2i: 'pe-i2i', edit: 'pe-i2i' }

// llama.cpp randomizes the image placeholder per model instance (and the router restarts the
// instance on every swap), so read it right before each multimodal request.
async function mediaMarker(model, signal) {
  const res = await fetch(`${config.llmUrl}/props?model=${encodeURIComponent(model)}`, { signal })
  if (!res.ok) throw new Error(`llama.cpp /props ${res.status}`)
  const marker = (await res.json()).media_marker
  if (!marker) throw new Error('El mejorador de edición no tiene visión cargada')
  return marker
}

const systemPrompts = {}
function systemPrompt(task) {
  systemPrompts[task] ??= fs.readFileSync(path.join(config.workflowsDir, 'prompts', `system_prompt_${task}.txt`), 'utf8').trim()
  return systemPrompts[task]
}

// Both system prompts ask for a JSON object that starts with this key.
const ANSWER_PREFIX = '{"rewritten_prompt": "'

// Same ChatML the ComfyUI PE node sends; the model opens its own <think> block. In fast mode we
// pre-fill an empty <think></think> *and* the start of the JSON: PE-I2I ignores the empty think
// block alone and keeps reasoning in plain text until it runs out of tokens.
const chatPrompt = (system, user, fast = false) =>
  `<|im_start|>system\n${system}<|im_end|>\n<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n` +
  (fast ? `<think>\n\n</think>\n\n${ANSWER_PREFIX}` : '')

// Without reasoning the answer is just the JSON, so a small cap is enough.
const FAST_MAX_TOKENS = 1536

function balancedBraces(text) {
  const spans = []
  let depth = 0, start = -1, inStr = false, escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inStr) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === '{') { if (depth === 0) start = i; depth++ }
    else if (ch === '}' && depth > 0) { depth--; if (depth === 0 && start >= 0) spans.push(text.slice(start, i + 1)) }
  }
  return spans
}

export function parseAnswer(raw) {
  const answer = raw.includes('</think>') ? raw.split('</think>').slice(1).join('</think>') : raw
  for (const candidate of balancedBraces(answer).reverse()) {
    try {
      const obj = JSON.parse(candidate)
      const rewritten = obj.rewritten_prompt ?? obj.rewrited_prompt
      if (typeof rewritten === 'string' && rewritten.trim()) {
        return { positive_prompt: rewritten.trim(), wh_ratio: String(obj.wh_ratio ?? '').trim() }
      }
    } catch { /* try the next candidate */ }
  }
  throw new Error('El mejorador no devolvió un JSON válido')
}

export async function ping() {
  const res = await fetch(`${config.llmUrl}/health`, { signal: AbortSignal.timeout(3000) })
  return res.ok
}

async function complete(body, signal) {
  const res = await fetch(`${config.llmUrl}/completion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`llama.cpp ${res.status}: ${(await res.text()).slice(0, 500)}`)
  return res
}

// Frees the enhancer's VRAM (single-GPU mode, so ComfyUI gets the card back).
export async function unload(model) {
  await fetch(`${config.llmUrl}/models/unload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  })
}

// Pre-computes the long T2I system prompt so later requests only process the user text.
export async function primeCache() {
  await complete({ model: MODELS.t2i, prompt: chatPrompt(systemPrompt('t2i'), 'hola'), n_predict: 1, cache_prompt: true })
}

// Resolves with { answer: { positive_prompt, wh_ratio }, timings } (timings as reported by llama.cpp).
async function streamAnswer(res, onToken, prefix = '') {
  let timings = null
  let raw = prefix
  let tokens = 0
  let buffer = ''
  const decoder = new TextDecoder()
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true })
    let nl
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const msg = JSON.parse(line.slice(5))
      raw += msg.content ?? ''
      if (msg.timings) timings = msg.timings
      tokens++
      onToken?.(tokens)
      if (msg.stop && msg.stop_type === 'limit') throw new Error('El mejorador se quedó sin tokens antes de terminar')
    }
  }
  return { answer: parseAnswer(raw), timings }
}

const SAMPLING = { temperature: 1.0, top_k: 20, top_p: 0.95, min_p: 0, repeat_penalty: 1.0 }

// Text-to-image: resolves with { answer: { positive_prompt, wh_ratio }, timings }.
export async function enhanceT2I(prompt, { seed = 42, fast = false, signal, onToken } = {}) {
  const res = await complete({
    model: MODELS.t2i,
    prompt: chatPrompt(systemPrompt('t2i'), prompt, fast),
    n_predict: fast ? FAST_MAX_TOKENS : config.llmMaxTokens,
    ...SAMPLING,
    presence_penalty: 1.5,
    seed,
    cache_prompt: true,
    stream: true,
  }, signal)
  return streamAnswer(res, onToken, fast ? ANSWER_PREFIX : '')
}

// Edit: the model sees the images as <image1>, <image2>… like the ComfyUI PE-I2I node.
// images: base64 strings (PNG/JPEG), in the same order the edit job will use.
export async function enhanceEdit(prompt, images, { seed = 42, fast = false, signal, onToken } = {}) {
  const marker = await mediaMarker(MODELS.edit, signal)
  const refs = images.map((_, i) => `<image${i + 1}> ${marker}`).join(' ')
  const res = await complete({
    model: MODELS.edit,
    prompt: { prompt_string: chatPrompt(systemPrompt('edit'), `${refs} ${prompt}`, fast), multimodal_data: images },
    n_predict: fast ? FAST_MAX_TOKENS : config.llmMaxTokens,
    ...SAMPLING,
    presence_penalty: 0,
    seed,
    cache_prompt: true,
    stream: true,
  }, signal)
  return streamAnswer(res, onToken, fast ? ANSWER_PREFIX : '')
}
