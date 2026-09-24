import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { cancelJob, rerunJob, submitJob, watchJob, type Job, type JobType, type RerunMode } from '@/lib/api'

// Submits a job and tracks it over SSE until it finishes.
export function useJob(onDone?: (job: Job) => void) {
  const [job, setJob] = useState<Job | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone })

  useEffect(() => () => stopRef.current?.(), [])

  const follow = useCallback(async (create: () => Promise<Job>) => {
    stopRef.current?.()
    setSubmitting(true)
    try {
      const created = await create()
      setJob(created)
      stopRef.current = watchJob(created.id, (j) => {
        setJob(j)
        if (j.status === 'done') onDoneRef.current?.(j)
        if (j.status === 'error' && j.error !== 'Cancelado') toast.error(j.error ?? 'Falló la generación')
      })
      return created
    } catch (err) {
      toast.error((err as Error).message)
      return null
    } finally {
      setSubmitting(false)
    }
  }, [])

  const run = useCallback(
    (type: JobType, params: Record<string, unknown>, images: Blob[] = []) => follow(() => submitJob(type, params, images)),
    [follow],
  )
  const rerun = useCallback((jobId: string, mode: RerunMode) => follow(() => rerunJob(jobId, mode)), [follow])

  const cancel = useCallback(async () => {
    if (!job) return
    try {
      await cancelJob(job.id)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }, [job])

  const busy = submitting || job?.status === 'queued' || job?.status === 'running'
  const reset = useCallback(() => {
    stopRef.current?.()
    setJob(null)
  }, [])

  return { job, run, rerun, cancel, busy, reset }
}
