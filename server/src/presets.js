import { ratios } from './workflows.js'

// Steps for "Renderizar final": same seed and resolution as the draft, so the composition holds.
export const FINAL_STEPS = 30

const QUALITY = {
  preview: { steps: 12, pixels: 0.5e6, resolution: 768 },
  normal: { steps: 25, pixels: 1e6, resolution: 1024 },
  hd: { steps: 40, pixels: null, resolution: 2048 },
}

const BLOCKED = [
  /\b(nude|naked|porn|nsfw|sex(ual|y)?|erotic|desnud[oa]s?|porno)\b/i,
  /\b(child|kid|minor|underage|teen(ager)?|ni[ñn][oa]s?|menor(es)?|adolescente)\b.*\b(nude|sex|desnud|sexual)/i,
]

export function checkPrompt(text = '') {
  if (BLOCKED.some((re) => re.test(text))) throw httpError(422, 'Prompt bloqueado por el filtro de contenido')
}

export function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode })
}

function snap32(n) {
  return Math.max(256, Math.round(n / 32) * 32)
}

const NATIVE_PIXELS = 2048 * 2048

function baseSize(ratio) {
  if (ratios[ratio]) return ratios[ratio]
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(ratio ?? '').trim())
  const r = m ? Number(m[1]) / Number(m[2]) : 1
  if (!(r >= 1 / 4 && r <= 4)) return ratios['1:1']
  return [snap32(Math.sqrt(NATIVE_PIXELS * r)), snap32(Math.sqrt(NATIVE_PIXELS / r))]
}

export function sizeFor(ratio, quality) {
  const base = baseSize(ratio)
  const q = QUALITY[quality] ?? QUALITY.normal
  if (!q.pixels) return { width: base[0], height: base[1] }
  const s = Math.sqrt(q.pixels / (base[0] * base[1]))
  return { width: snap32(base[0] * s), height: snap32(base[1] * s) }
}

const RGBA_WRAP = (d) =>
  `This is an RGBA format image with transparency. ${d}. The image has an alpha channel and a transparent background.`

const PEOPLE_REQUIRE_CONSENT = 'Debes confirmar que tienes permiso de las personas que aparecen'

// An enhanced prompt already references <image1>… and replaces the preset template entirely.
function rawEdit(raw, common, q, minImages, maxImages) {
  const prompt = String(raw).trim()
  if (!prompt) throw httpError(400, 'prompt requerido')
  checkPrompt(prompt)
  return { workflow: 'edit', minImages, maxImages, needsConsent: true, params: { ...common, prompt, resolution: q.resolution } }
}

// Turns a user request into { workflow, params, minImages, maxImages, needsConsent }.
export function resolvePreset(type, input) {
  const quality = QUALITY[input.quality] ? input.quality : 'normal'
  const q = QUALITY[quality]
  const seed = Number.isInteger(input.seed) ? input.seed : Math.floor(Math.random() * 2 ** 32)
  const prompt = String(input.prompt ?? '').trim()
  const common = { seed, steps: input.steps ?? q.steps }

  switch (type) {
    case 't2i': {
      if (!prompt) throw httpError(400, 'prompt requerido')
      checkPrompt(prompt)
      return { workflow: 't2i', minImages: 0, maxImages: 0, params: { ...common, prompt, ...sizeFor(input.ratio ?? '1:1', quality) } }
    }
    case 'enhance': {
      const target = input.target ?? 't2i'
      const fast = input.fast !== false
      if (target === 't2i') {
        if (!prompt) throw httpError(400, 'prompt requerido')
        checkPrompt(prompt)
        return { workflow: 'llm_t2i', minImages: 0, maxImages: 0, params: { seed, prompt, fast } }
      }
      if (!['edit', 'meme', 'group'].includes(target)) throw httpError(400, `target inválido: ${target}`)
      // Build the same prompt the edit job would use, so the enhancer rewrites exactly that.
      const base = resolvePreset(target, { ...input, rawPrompt: undefined })
      return {
        workflow: 'llm_edit', minImages: base.minImages, maxImages: base.maxImages, needsConsent: base.needsConsent,
        params: { seed, prompt: base.params.prompt, target, fast },
      }
    }
    case 'upscale':
      // RealESRGAN 2x: lets the user iterate at low resolution and enlarge only the final version.
      return { workflow: 'upscale', minImages: 1, maxImages: 1, params: {} }
    case 'edit': {
      if (!prompt) throw httpError(400, 'instrucción requerida')
      checkPrompt(prompt)
      return { workflow: 'edit', minImages: 1, maxImages: 10, params: { ...common, prompt, resolution: q.resolution } }
    }
    case 'sticker_generate': {
      if (!prompt) throw httpError(400, 'descripción requerida')
      checkPrompt(prompt)
      const style = input.cartoon ? ', cartoon sticker style with a thick white outline' : ''
      return {
        workflow: 't2i', minImages: 0, maxImages: 0,
        params: { ...common, prompt: RGBA_WRAP(prompt + style), ...sizeFor('1:1', quality === 'hd' ? 'normal' : quality) },
      }
    }
    case 'sticker_extract': {
      const style = input.cartoon
        ? ' Then restyle the subject as a cartoon sticker with a thick white outline.'
        : ''
      return {
        workflow: 'edit', minImages: 1, maxImages: 1,
        params: { ...common, prompt: `Remove the background, and output a PNG image.${style}`, resolution: q.resolution },
      }
    }
    case 'meme': {
      if (!input.consent) throw httpError(400, PEOPLE_REQUIRE_CONSENT)
      if (input.rawPrompt) return rawEdit(input.rawPrompt, common, q, 2, 2)
      const extra = prompt ? ` ${prompt}` : ''
      checkPrompt(extra)
      return {
        workflow: 'edit', minImages: 2, maxImages: 2, needsConsent: true,
        params: {
          ...common,
          prompt:
            'Replace the person in <image1> with the person from <image2>. Keep the exact pose, expression, framing, composition and any text of <image1>, and preserve the facial identity of the person from <image2>.' + extra,
          resolution: q.resolution,
        },
      }
    }
    case 'group': {
      if (!input.consent) throw httpError(400, PEOPLE_REQUIRE_CONSENT)
      if (input.rawPrompt) return rawEdit(input.rawPrompt, common, q, 2, 10)
      if (!prompt) throw httpError(400, 'escena requerida')
      checkPrompt(prompt)
      const n = Number(input.imageCount ?? 0)
      const positions = Array.isArray(input.positions) ? input.positions : []
      const refs = Array.from({ length: n }, (_, i) => {
        const pos = positions[i] ? ` ${positions[i]}` : ''
        return `the person from <image${i + 1}>${pos}`
      }).join(', ')
      return {
        workflow: 'edit', minImages: 2, maxImages: 10, needsConsent: true,
        params: {
          ...common,
          prompt: `Create a single photograph showing ${refs}. Scene: ${prompt}. Preserve each person's facial identity, natural proportions and consistent lighting.`,
          resolution: q.resolution,
        },
      }
    }
    default:
      throw httpError(400, `Tipo de trabajo desconocido: ${type}`)
  }
}

export const qualityInfo = QUALITY
