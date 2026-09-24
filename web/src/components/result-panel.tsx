import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { DicesIcon, DownloadIcon, GemIcon, PencilIcon, ScalingIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { APP_NAME, Mascot } from '@/components/brand'
import { GenerationInfo } from '@/components/generation-info'
import { ImageViewer } from '@/components/image-viewer'
import { JobStatus } from '@/components/job-status'
import { Lightbox } from '@/components/lightbox'
import { useJob } from '@/hooks/use-job'
import { canFinalize, canRerun, fetchBlob, FINAL_STEPS, outputUrls, type Job, type RerunMode } from '@/lib/api'
import { CHECKERBOARD } from '@/lib/styles'
import { cn } from '@/lib/utils'

interface ResultPanelProps {
  job: Job | null
  onCancel: () => void
  onEdit?: (url: string) => void
  emptyText: string
  transparent?: boolean
  extraActions?: (url: string) => ReactNode
  onRerun?: (jobId: string, mode: RerunMode) => void
}

export function ResultPanel({ job, onCancel, onEdit, emptyText, transparent, extraActions, onRerun }: ResultPanelProps) {
  // Keep showing the last result while a new one (e.g. a variant) is being generated.
  const doneJob = job?.status === 'done' ? job : null
  const [lastDoneJob, setLastDoneJob] = useState<Job | null>(doneJob)
  if (doneJob && doneJob.id !== lastDoneJob?.id) setLastDoneJob(doneJob)
  const [original] = lastDoneJob ? outputUrls(lastDoneJob) : []
  const upscale = useJob()
  const [upscaled] = upscale.job?.status === 'done' ? outputUrls(upscale.job) : []
  const [showUpscaled, setShowUpscaled] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const { reset: resetUpscale } = upscale

  // A new result invalidates the previous enlargement.
  useEffect(() => { resetUpscale() }, [job?.id, resetUpscale])

  const url = upscaled && showUpscaled ? upscaled : original
  const working = job?.status === 'queued' || job?.status === 'running'
  const infoJob = url && url === upscaled ? upscale.job : lastDoneJob
  const suffix = url === upscaled ? '-2x' : ''
  const filename = `qwen-${job?.id.slice(0, 8)}${suffix}.png`

  const enlarge = async () => {
    if (!original) return
    try {
      setShowUpscaled(true)
      await upscale.run('upscale', {}, [await fetchBlob(original)])
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <Card className='lg:min-h-[calc(100dvh-8.5rem)]'>
      <CardContent className='flex h-full flex-1 flex-col gap-4'>
        <JobStatus job={job} onCancel={onCancel} />
        {!url ? (
          <div className='bg-dots flex min-h-80 flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-6 text-center text-muted-foreground'>
            <Mascot size={144} className={cn(working && 'animate-float')} />
            <p className='max-w-xs text-sm text-balance'>
              {working ? `${APP_NAME} está trabajando en tu imagen…` : emptyText}
            </p>
          </div>
        ) : (
          <>
            <div
              className={cn(
                'relative flex h-[60dvh] rounded-2xl border p-3 lg:h-auto lg:min-h-96 lg:flex-1 lg:p-5',
                transparent ? CHECKERBOARD : 'bg-dots',
                working && 'ai-ring',
              )}
            >
              <ImageViewer
                src={url}
                alt='Resultado generado'
                onFullscreen={() => setFullscreen(true)}
                toolbarExtra={<GenerationInfo job={infoJob} triggerClassName='text-white hover:bg-white/20 hover:text-white' />}
                className='flex-1 rounded-xl'
                imgClassName='drop-shadow-[0_18px_30px_rgb(0_0_0/0.28)]'
              />
            </div>
            <JobStatus job={upscale.job} onCancel={upscale.cancel} />
            <div className='flex flex-wrap items-center gap-2'>
              <Button variant='outline' asChild>
                <a href={url} download={filename}>
                  <DownloadIcon /> Descargar PNG
                </a>
              </Button>
              {onEdit && (
                <Button variant='outline' onClick={() => onEdit(url)}>
                  <PencilIcon /> Editar esta imagen
                </Button>
              )}
              {!transparent && !upscaled && (
                <Button variant='outline' onClick={enlarge} disabled={upscale.busy}>
                  <ScalingIcon /> Ampliar 2×
                </Button>
              )}
              {upscaled && (
                <ToggleGroup
                  type='single'
                  variant='outline'
                  value={showUpscaled ? 'up' : 'orig'}
                  onValueChange={(v) => v && setShowUpscaled(v === 'up')}
                  aria-label='Versión mostrada'
                >
                  <ToggleGroupItem value='orig'>Original</ToggleGroupItem>
                  <ToggleGroupItem value='up'>Ampliada 2×</ToggleGroupItem>
                </ToggleGroup>
              )}
              {onRerun && canRerun(job) && (
                <Button variant='outline' onClick={() => onRerun(job!.id, 'variant')} title='Mismo prompt con otra semilla; reutiliza el análisis del prompt'>
                  <DicesIcon /> Otra variante
                </Button>
              )}
              {onRerun && canFinalize(job) && (
                <Button variant='outline' onClick={() => onRerun(job!.id, 'final')} title={`Misma semilla y resolución con ${FINAL_STEPS} pasos`}>
                  <GemIcon /> Renderizar final
                </Button>
              )}
              {extraActions?.(url)}
            </div>
          </>
        )}
      </CardContent>
      <Lightbox src={fullscreen ? url ?? null : null} onClose={() => setFullscreen(false)} transparent={transparent} filename={filename} />
    </Card>
  )
}
