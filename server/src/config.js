import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')

export const config = {
  port: Number(process.env.PORT ?? 3000),
  comfyUrl: process.env.COMFY_URL ?? 'http://localhost:8188',
  llmUrl: process.env.LLM_URL ?? 'http://localhost:8189',
  // Same GPU for ComfyUI and the prompt enhancer (the default, single-GPU setup): they take turns.
  sharedGpu: (process.env.COMFY_GPU ?? '0') === (process.env.LLM_GPU ?? '0'),
  llmMaxTokens: Number(process.env.LLM_MAX_TOKENS ?? 8192),
  apiKey: process.env.API_KEY ?? '',
  dataDir: process.env.DATA_DIR ?? path.join(root, 'server-data'),
  workflowsDir: process.env.WORKFLOWS_DIR ?? path.join(root, 'workflows'),
  webDir: process.env.WEB_DIR ?? path.join(root, 'web', 'dist'),
  // ComfyUI's own copies of inputs/outputs, removed together with each job (privacy).
  comfyInputDir: process.env.COMFY_INPUT_DIR ?? path.join(root, 'storage-user', 'input'),
  comfyOutputDir: process.env.COMFY_OUTPUT_DIR ?? path.join(root, 'storage-user', 'output'),
  retentionHours: Number(process.env.RETENTION_HOURS ?? 24),
  jobTimeoutMs: Number(process.env.JOB_TIMEOUT_MS ?? 30 * 60 * 1000),
}
