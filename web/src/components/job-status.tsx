import { LoaderCircleIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { Job } from '@/lib/api'
import { PHASE_LABEL } from '@/lib/phases'


function label(job: Job) {
  if (job.status === 'queued') {
    return job.queuePosition && job.queuePosition > 1 ? `En cola: posición ${job.queuePosition}` : 'En cola…'
  }
  if (job.type === 'enhance') {
    if (job.phase === 'thinking') return `Mejorando el prompt… ${(job.tokens ?? 0).toLocaleString('es')} tokens`
    return 'Cargando el mejorador…'
  }
  if (job.phase === 'sampling') return `Generando ${Math.round(job.progress * 100)}%`
  if (job.phase === 'encoding' && job.type !== 't2i' && job.type !== 'sticker_generate') {
    return 'Analizando prompt e imágenes…'
  }
  return job.phase ? PHASE_LABEL[job.phase] : 'Iniciando…'
}

export function JobStatus({ job, onCancel }: { job: Job | null; onCancel: () => void }) {
  if (!job || job.status === 'done' || job.status === 'error') return null
  const sampling = job.phase === 'sampling'
  return (
    <div className='flex items-center gap-3 rounded-lg border bg-muted/40 p-3' role='status' aria-live='polite'>
      <LoaderCircleIcon className='size-4 shrink-0 animate-spin text-muted-foreground' />
      <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
        <span className='text-sm'>{label(job)}</span>
        <Progress
          value={sampling || job.phase === 'decoding' || job.phase === 'saving' ? job.progress * 100 : 0}
          className={sampling ? undefined : 'animate-pulse'}
        />
      </div>
      <Button variant='ghost' size='icon-sm' onClick={onCancel} aria-label='Cancelar trabajo'>
        <XIcon />
      </Button>
    </div>
  )
}
