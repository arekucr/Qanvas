import type { JobPhase, JobType } from '@/lib/api'

export const PHASE_LABEL: Record<JobPhase, string> = {
  uploading: 'Subiendo imágenes…',
  waiting: 'Esperando la GPU…',
  loading: 'Cargando modelos…',
  images: 'Preparando imágenes…',
  encoding: 'Analizando el prompt…',
  sampling: 'Generando',
  decoding: 'Finalizando…',
  saving: 'Guardando…',
  thinking: 'Mejorando el prompt…',
  upscaling: 'Ampliando 2×…',
}

// Noun form of each phase, for the generation details panel.
export const PHASE_NAME: Record<JobPhase | 'queue', string> = {
  queue: 'En cola',
  uploading: 'Subida de imágenes',
  waiting: 'Esperando la GPU',
  loading: 'Carga de modelos',
  images: 'Preparación de imágenes',
  encoding: 'Análisis del prompt',
  sampling: 'Generación (difusión)',
  decoding: 'Decodificación (VAE)',
  saving: 'Guardado',
  thinking: 'Escritura del prompt',
  upscaling: 'Ampliación 2×',
}

export const PHASE_COLOR: Record<JobPhase | 'queue', string> = {
  queue: 'var(--muted-foreground)',
  uploading: 'var(--qanvas-blue-light)',
  waiting: 'var(--border)',
  loading: 'var(--qanvas-orange)',
  images: 'var(--qanvas-blue-light)',
  encoding: 'var(--qanvas-yellow)',
  sampling: 'var(--qanvas-blue)',
  decoding: 'var(--qanvas-green)',
  saving: 'var(--success)',
  thinking: 'var(--qanvas-blue)',
  upscaling: 'var(--qanvas-green)',
}

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  t2i: 'Generar',
  edit: 'Editor',
  enhance: 'Mejorar prompt',
  sticker_generate: 'Sticker',
  sticker_extract: 'Sticker',
  meme: 'Meme',
  group: 'Grupo',
  upscale: 'Ampliada 2×',
}
