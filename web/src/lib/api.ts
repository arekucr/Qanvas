export type JobType = 't2i' | 'edit' | 'enhance' | 'sticker_generate' | 'sticker_extract' | 'meme' | 'group' | 'upscale'
export type JobStatus = 'queued' | 'running' | 'done' | 'error'
export type Quality = 'preview' | 'normal' | 'hd'
export type JobPhase =
  | 'uploading' | 'waiting' | 'loading' | 'images' | 'encoding' | 'sampling' | 'decoding' | 'saving' | 'thinking' | 'upscaling'

export interface JobMeta {
  queueMs: number
  runMs: number
  totalMs: number
  phases: { phase: JobPhase; ms: number }[]
  inputs?: { bytes: number; width?: number; height?: number }[]
  output?: { bytes: number; width?: number; height?: number }
  models?: Record<string, string>
  sampler?: { seed: number; steps: number; cfg: number; sampler: string; scheduler: string; denoise: number }
  promptSent?: string
  encodeResolution?: number
  cached?: string[]
  comfyPromptId?: string
  gpu?: { name: string; vramTotal: number; vramFree: number }
  enhancer?: {
    model: string
    mode: string
    target: string
    promptTokens?: number
    promptMs?: number
    cachedTokens?: number
    generatedTokens?: number
    generateMs?: number
    tokensPerSecond?: number
  }
}

export interface Job {
  id: string
  type: JobType
  status: JobStatus
  progress: number
  params: Record<string, unknown>
  result: { files?: string[]; text?: Record<string, string>; meta?: JobMeta } | null
  error: string | null
  createdAt: number
  updatedAt: number
  queuePosition: number | null
  phase: JobPhase | null
  // Tokens generated so far by the prompt enhancer (null for image jobs).
  tokens?: number | null
}

export interface Meta {
  ratios: Record<string, [number, number]>
  retentionHours: number
}

const API_KEY_STORAGE = 'qwen-studio-api-key'

export function getApiKey() {
  try { return localStorage.getItem(API_KEY_STORAGE) ?? '' } catch { return '' }
}

export function setApiKey(key: string) {
  try { localStorage.setItem(API_KEY_STORAGE, key) } catch { /* private mode */ }
}

function withKey(url: string) {
  const key = getApiKey()
  return key ? `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}` : url
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const key = getApiKey()
  if (key) headers.set('x-api-key', key)
  const res = await fetch(url, { ...init, headers })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
  return body as T
}

export const getMeta = () => request<Meta>('/api/meta')
export interface Health {
  ok: boolean
  comfy: boolean
  llm: boolean
  warm: { comfy: boolean; llm: boolean }
}

export const getHealth = () => request<Health>('/api/health')
export const listJobs = () => request<Job[]>('/api/jobs')
export const getJob = (id: string) => request<Job>(`/api/jobs/${id}`)

// Deletes finished jobs everywhere (app + ComfyUI copies). Running jobs come back in `skipped`.
export const deleteJobs = (ids: string[]) =>
  request<{ deleted: string[]; skipped: string[] }>('/api/jobs/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
export const cancelJob = (id: string) => request<{ ok: boolean }>(`/api/jobs/${id}`, { method: 'DELETE' })

// Must match FINAL_STEPS in server/src/presets.js.
export const FINAL_STEPS = 30
export type RerunMode = 'variant' | 'final'

export const rerunJob = (id: string, mode: RerunMode) =>
  request<Job>(`/api/jobs/${id}/rerun`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })

// Jobs with a seed can be retried ("Otra variante") or re-rendered at FINAL_STEPS with the same seed.
export const canRerun = (job: Job | null) => !!job && job.status === 'done' && typeof job.params.seed === 'number'
export const canFinalize = (job: Job | null) => canRerun(job) && Number(job!.params.steps) < FINAL_STEPS

export function submitJob(type: JobType, params: Record<string, unknown>, images: Blob[] = []) {
  const form = new FormData()
  form.append('type', type)
  form.append('params', JSON.stringify(params))
  images.forEach((img, i) => form.append('images', img, `image_${i + 1}.png`))
  return request<Job>('/api/jobs', { method: 'POST', body: form })
}

export function watchJob(id: string, onUpdate: (job: Job) => void) {
  const source = new EventSource(withKey(`/api/jobs/${id}/events`))
  source.onmessage = (ev) => {
    const job = JSON.parse(ev.data) as Job
    onUpdate(job)
    if (job.status === 'done' || job.status === 'error') source.close()
  }
  return () => source.close()
}

export const fileUrl = (jobId: string, name: string) => withKey(`/api/files/${jobId}/${name}`)

export const outputUrls = (job: Job) => (job.result?.files ?? []).map((f) => fileUrl(job.id, f))

export async function fetchBlob(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`No se pudo descargar la imagen (${res.status})`)
  return res.blob()
}
