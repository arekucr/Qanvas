import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertCircleIcon, LoaderCircleIcon, PencilIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Mascot } from '@/components/brand'
import { GenerationInfo } from '@/components/generation-info'
import { Lightbox } from '@/components/lightbox'
import { CHECKERBOARD } from '@/lib/styles'
import { deleteJobs, getMeta, listJobs, outputUrls, type Job } from '@/lib/api'
import { JOB_TYPE_LABEL } from '@/lib/phases'
import { cn } from '@/lib/utils'

const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
const isActive = (j: Job) => j.status === 'queued' || j.status === 'running'

export function HistoryPage({ onEdit }: { onEdit: (url: string) => void }) {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [retention, setRetention] = useState<number | null>(null)
  const [open, setOpen] = useState<{ url: string; transparent: boolean } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Ids waiting for confirmation in the delete dialog.
  const [confirm, setConfirm] = useState<string[] | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = () => {
    listJobs()
      .then((list) => {
        setJobs(list)
        const alive = new Set(list.filter((j) => !isActive(j)).map((j) => j.id))
        setSelected((s) => new Set([...s].filter((id) => alive.has(id))))
      })
      .catch(() => setJobs([]))
  }
  useEffect(() => {
    load()
    getMeta().then((m) => setRetention(m.retentionHours)).catch(() => {})
  }, [])

  const selectable = (jobs ?? []).filter((j) => !isActive(j))
  const allSelected = selectable.length > 0 && selected.size === selectable.length
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const remove = async (ids: string[]) => {
    setDeleting(true)
    try {
      const { deleted, skipped } = await deleteJobs(ids)
      toast.success(deleted.length === 1 ? 'Imagen eliminada' : `${deleted.length} elementos eliminados`)
      if (skipped.length) toast.warning(`${skipped.length} no se pudieron eliminar (siguen en proceso)`)
      setSelected((s) => new Set([...s].filter((id) => !deleted.includes(id))))
      load()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setDeleting(false)
      setConfirm(null)
    }
  }

  return (
    <Card>
      <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-4'>
        <div className='flex flex-col gap-1.5'>
          <CardTitle>Historial</CardTitle>
          <CardDescription>
            {retention ? `Las imágenes se borran automáticamente después de ${retention} horas.` : 'Tus trabajos recientes.'}
          </CardDescription>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          {selectable.length > 0 && (
            <div className='flex items-center gap-2 rounded-lg border px-2.5 py-1.5'>
              <Checkbox
                id='select-all'
                checked={allSelected ? true : selected.size > 0 ? 'indeterminate' : false}
                onCheckedChange={(v) => setSelected(v === true ? new Set(selectable.map((j) => j.id)) : new Set())}
              />
              <Label htmlFor='select-all' className='text-sm font-normal'>
                {selected.size > 0 ? `${selected.size} seleccionado${selected.size === 1 ? '' : 's'}` : 'Seleccionar todo'}
              </Label>
            </div>
          )}
          {selected.size > 0 && (
            <Button variant='destructive' size='sm' onClick={() => setConfirm([...selected])} disabled={deleting}>
              <Trash2Icon /> Eliminar ({selected.size})
            </Button>
          )}
          <Button variant='outline' size='sm' onClick={load}><RefreshCwIcon /> Actualizar</Button>
        </div>
      </CardHeader>
      <CardContent>
        {jobs === null ? (
          <div className={GRID}>
            {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className='aspect-square' />)}
          </div>
        ) : jobs.length === 0 ? (
          <div className='flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground'>
            <Mascot size={128} />
            Todavía no hay trabajos. ¡Crea tu primera imagen!
          </div>
        ) : (
          <div className={GRID}>
            {jobs.map((job) => {
              const [url] = outputUrls(job)
              const sticker = job.type.startsWith('sticker')
              const checked = selected.has(job.id)
              const label = JOB_TYPE_LABEL[job.type]
              return (
                <div key={job.id} className='group flex flex-col gap-1.5'>
                  <div
                    className={cn(
                      'relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-muted/30',
                      sticker && url && CHECKERBOARD,
                      checked && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                    )}
                  >
                    {url ? (
                      <button
                        type='button'
                        className='size-full cursor-zoom-in'
                        onClick={() => setOpen({ url, transparent: sticker })}
                        aria-label={`Ver ${label} en pantalla completa`}
                      >
                        <img src={url} alt={label} loading='lazy' className='size-full object-contain' />
                      </button>
                    ) : job.result?.text?.positive_prompt ? (
                      <p className='line-clamp-[10] p-3 text-xs text-muted-foreground' title={job.result.text.positive_prompt}>
                        {job.result.text.positive_prompt}
                      </p>
                    ) : job.status === 'error' ? (
                      <AlertCircleIcon className='size-6 text-destructive' aria-label='Error' />
                    ) : job.status === 'done' ? null : (
                      <LoaderCircleIcon className='size-6 animate-spin text-muted-foreground' aria-label='En proceso' />
                    )}

                    <GenerationInfo
                      job={job}
                      triggerClassName='absolute top-2 left-2 bg-background/80 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100'
                    />
                    {!isActive(job) && (
                      <div
                        className={cn(
                          'absolute top-2 right-2 flex rounded-md bg-background/85 p-1 shadow-sm transition-opacity',
                          checked || selected.size > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
                        )}
                      >
                        <Checkbox checked={checked} onCheckedChange={(v) => toggle(job.id, v === true)} aria-label={`Seleccionar ${label}`} />
                      </div>
                    )}
                    {!isActive(job) && (
                      <Button
                        size='icon-xs'
                        variant='destructive'
                        className='absolute bottom-2 left-2 bg-background/85 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-destructive hover:text-white'
                        onClick={() => setConfirm([job.id])}
                        aria-label={`Eliminar ${label}`}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                    {url && (
                      <Button
                        size='xs'
                        variant='secondary'
                        className='absolute right-2 bottom-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100'
                        onClick={() => onEdit(url)}
                      >
                        <PencilIcon /> Editar
                      </Button>
                    )}
                  </div>
                  <div className='flex items-center justify-between gap-2 text-xs text-muted-foreground'>
                    <Badge variant='secondary'>{label}</Badge>
                    <span>{new Date(job.createdAt).toLocaleString()}</span>
                  </div>
                  {job.error && <span className='truncate text-xs text-destructive' title={job.error}>{job.error}</span>}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && !deleting && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.length === 1 ? '¿Eliminar esta imagen?' : `¿Eliminar ${confirm?.length ?? 0} elementos?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se borran definitivamente del servidor, incluidas las fotos subidas y las copias de ComfyUI. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                if (confirm) remove(confirm)
              }}
            >
              {deleting ? <LoaderCircleIcon className='animate-spin' /> : <Trash2Icon />} Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Lightbox src={open?.url ?? null} transparent={open?.transparent} onClose={() => setOpen(null)} />
    </Card>
  )
}
