import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { CheckIcon, CopyIcon, InfoIcon, LoaderCircleIcon, ZapIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { getJob, type Job, type JobMeta } from '@/lib/api'
import { JOB_TYPE_LABEL, PHASE_COLOR, PHASE_NAME } from '@/lib/phases'
import { cn } from '@/lib/utils'

function fmtMs(ms?: number) {
  if (ms == null) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} s`
  return `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`
}

function fmtBytes(b?: number) {
  if (b == null) return '—'
  return b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`
}

const fmtNum = (n?: number) => (n == null ? '—' : n.toLocaleString('es'))

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      variant='ghost'
      size='icon-xs'
      aria-label={label}
      onClick={() => {
        navigator.clipboard.writeText(text).then(
          () => { setDone(true); setTimeout(() => setDone(false), 1200) },
          () => toast.error('No se pudo copiar'),
        )
      }}
    >
      {done ? <CheckIcon className='text-success' /> : <CopyIcon />}
    </Button>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className='flex flex-col gap-2'>
      <h3 className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>{title}</h3>
      {children}
    </section>
  )
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm'>
      {rows.map(([k, v]) => (
        <div key={k} className='contents'>
          <dt className='text-muted-foreground'>{k}</dt>
          <dd className='min-w-0 text-right font-medium tabular-nums break-words'>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Timeline({ meta }: { meta: JobMeta }) {
  const segments = [
    ...(meta.queueMs > 50 ? [{ phase: 'queue' as const, ms: meta.queueMs }] : []),
    ...meta.phases.filter((p) => p.ms > 0),
  ]
  const total = segments.reduce((s, p) => s + p.ms, 0) || 1
  return (
    <div className='flex flex-col gap-3'>
      <div className='flex h-3 w-full overflow-hidden rounded-full bg-muted' role='img' aria-label='Tiempo por etapa'>
        {segments.map((s, i) => (
          <div key={i} style={{ width: `${(s.ms / total) * 100}%`, background: PHASE_COLOR[s.phase] }} title={`${PHASE_NAME[s.phase]}: ${fmtMs(s.ms)}`} />
        ))}
      </div>
      <ul className='flex flex-col gap-1.5 text-sm'>
        {segments.map((s, i) => (
          <li key={i} className='flex items-center gap-2'>
            <span className='size-2.5 shrink-0 rounded-full' style={{ background: PHASE_COLOR[s.phase] }} aria-hidden />
            <span className='flex-1 text-muted-foreground'>{PHASE_NAME[s.phase]}</span>
            <span className='font-medium tabular-nums'>{fmtMs(s.ms)}</span>
            <span className='w-10 text-right text-xs text-muted-foreground tabular-nums'>{Math.round((s.ms / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Details({ job }: { job: Job }) {
  const meta = job.result?.meta
  const sampling = meta?.phases.find((p) => p.phase === 'sampling')
  const steps = meta?.sampler?.steps ?? (job.params.steps as number | undefined)
  const cachedEncoder = meta?.cached?.includes('TextEncodeQwenImage21')
  const e = meta?.enhancer

  return (
    <div className='flex flex-col gap-6 px-4 pb-6'>
      {!meta && (
        <p className='rounded-lg border border-dashed p-3 text-sm text-muted-foreground'>
          Este trabajo es anterior a la recolección de métricas: solo hay parámetros básicos.
        </p>
      )}

      {meta && (
        <Section title='Tiempos'>
          <div className='grid grid-cols-3 gap-2 text-center'>
            {[['Total', meta.totalMs], ['En cola', meta.queueMs], ['Ejecución', meta.runMs]].map(([k, v]) => (
              <div key={k as string} className='rounded-lg bg-muted/60 p-2'>
                <div className='text-lg font-semibold tabular-nums'>{fmtMs(v as number)}</div>
                <div className='text-xs text-muted-foreground'>{k}</div>
              </div>
            ))}
          </div>
          <Timeline meta={meta} />
          {cachedEncoder && (
            <p className='flex items-center gap-1.5 text-sm text-success'>
              <ZapIcon className='size-4' /> El análisis del prompt se reutilizó del caché.
            </p>
          )}
          {sampling && steps ? (
            <p className='text-sm text-muted-foreground'>
              Velocidad de difusión: <span className='font-medium text-foreground'>{(sampling.ms / 1000 / steps).toFixed(2)} s/paso</span>
            </p>
          ) : null}
        </Section>
      )}

      {e && (
        <Section title='Mejorador de prompt'>
          <Rows rows={[
            ['Modelo', e.model],
            ['Modo', e.mode],
            ['Tokens de entrada', e.cachedTokens ? `${fmtNum(e.promptTokens)} (+${fmtNum(e.cachedTokens)} en caché)` : fmtNum(e.promptTokens)],
            ['Lectura de la entrada', fmtMs(e.promptMs)],
            ['Tokens generados', fmtNum(e.generatedTokens)],
            ['Tiempo de escritura', fmtMs(e.generateMs)],
            ['Velocidad', e.tokensPerSecond ? `${e.tokensPerSecond} tok/s` : '—'],
          ]} />
        </Section>
      )}

      {job.type !== 'enhance' && (
        <Section title='Parámetros'>
          <Rows rows={[
            ['Semilla', job.params.seed != null ? (
              <span key='seed' className='inline-flex items-center gap-1'>
                {String(job.params.seed)}
                <CopyButton text={String(job.params.seed)} label='Copiar semilla' />
              </span>
            ) : '—'],
            ['Pasos', steps ?? '—'],
            ...(meta?.sampler ? [
              ['CFG', meta.sampler.cfg],
              ['Sampler', `${meta.sampler.sampler} · ${meta.sampler.scheduler}`],
            ] as [string, ReactNode][] : []),
            ['Resolución final', meta?.output?.width ? `${meta.output.width}×${meta.output.height} px` : job.params.width ? `${job.params.width}×${job.params.height} px` : '—'],
            ...(meta?.encodeResolution ? [['Presupuesto por imagen', `${meta.encodeResolution}² px`]] as [string, ReactNode][] : []),
            ...(meta?.output ? [['Tamaño del archivo', fmtBytes(meta.output.bytes)]] as [string, ReactNode][] : []),
            ...(meta?.inputs?.length ? [['Imágenes de entrada', `${meta.inputs.length} (${fmtBytes(meta.inputs.reduce((s, i) => s + i.bytes, 0))})`]] as [string, ReactNode][] : []),
          ]} />
        </Section>
      )}

      {meta?.models && Object.keys(meta.models).length > 0 && (
        <Section title='Modelos'>
          <Rows rows={Object.entries(meta.models).map(([k, v]) => [k, <span key={k} className='font-mono text-xs'>{v}</span>])} />
        </Section>
      )}

      {meta?.gpu && (
        <Section title='GPU'>
          <Rows rows={[
            ['Tarjeta', meta.gpu.name],
            ['VRAM libre al terminar', `${fmtBytes(meta.gpu.vramFree)} de ${fmtBytes(meta.gpu.vramTotal)}`],
          ]} />
        </Section>
      )}

      {(meta?.promptSent || typeof job.params.prompt === 'string') && (
        <Section title='Prompt enviado al modelo'>
          <div className='relative rounded-lg bg-muted/60 p-3 pr-9 text-sm whitespace-pre-wrap'>
            {meta?.promptSent ?? String(job.params.prompt)}
            <div className='absolute top-1.5 right-1.5'>
              <CopyButton text={meta?.promptSent ?? String(job.params.prompt)} label='Copiar prompt' />
            </div>
          </div>
        </Section>
      )}

      <Section title='Identificadores'>
        <Rows rows={[
          ['Trabajo', <span key='id' className='font-mono text-xs'>{job.id}</span>],
          ...(meta?.comfyPromptId ? [['ComfyUI', <span key='c' className='font-mono text-xs'>{meta.comfyPromptId}</span>]] as [string, ReactNode][] : []),
          ...(job.params.rerunOf ? [['Derivado de', <span key='r' className='font-mono text-xs'>{String(job.params.rerunOf)}</span>]] as [string, ReactNode][] : []),
        ]} />
      </Section>
    </div>
  )
}

interface GenerationInfoProps {
  job?: Job | null
  // Alternative to `job`: fetched when the panel opens.
  jobId?: string
  triggerClassName?: string
}

export function GenerationInfo({ job, jobId, triggerClassName }: GenerationInfoProps) {
  const [loaded, setLoaded] = useState<Job | null>(null)
  const [loading, setLoading] = useState(false)
  const shown = job ?? loaded

  const onOpenChange = (open: boolean) => {
    if (!open || job || !jobId) return
    setLoading(true)
    getJob(jobId)
      .then(setLoaded)
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false))
  }

  return (
    <Sheet onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant='ghost' size='icon-xs' className={cn(triggerClassName)} aria-label='Detalles de la generación'>
          <InfoIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side='right' className='w-full overflow-y-auto sm:max-w-md'>
        <SheetHeader>
          <SheetTitle>Detalles de la generación</SheetTitle>
          <SheetDescription asChild>
            <div className='flex flex-wrap items-center gap-2'>
              {shown && <Badge variant='secondary'>{JOB_TYPE_LABEL[shown.type]}</Badge>}
              {shown && <span>{new Date(shown.createdAt).toLocaleString('es')}</span>}
              {shown?.status === 'error' && <Badge variant='destructive'>{shown.error}</Badge>}
            </div>
          </SheetDescription>
        </SheetHeader>
        {loading || !shown ? (
          <div className='flex justify-center p-8 text-muted-foreground'>
            <LoaderCircleIcon className='size-5 animate-spin' aria-label='Cargando' />
          </div>
        ) : (
          <Details job={shown} />
        )}
      </SheetContent>
    </Sheet>
  )
}
