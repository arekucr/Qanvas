import { useState } from 'react'
import { Undo2Icon, WandSparklesIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { JobStatus } from '@/components/job-status'
import type { Job } from '@/lib/api'

interface EnhancedPromptFieldProps {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  // Enhanced prompt: when set it replaces the page's template and is sent as-is.
  raw: string | null
  onRawChange: (v: string | null) => void
  canEnhance: boolean
  enhanceHint?: string
  onEnhance: (fast: boolean) => Promise<unknown> | void
  enhancer: { job: Job | null; busy: boolean; cancel: () => void }
}

export function EnhancedPromptField({
  id, label, value, onChange, placeholder, rows = 3, raw, onRawChange, canEnhance, enhanceHint, onEnhance, enhancer,
}: EnhancedPromptFieldProps) {
  const enhanced = raw !== null
  // Preparing the images takes a moment before the job exists; block double clicks meanwhile.
  const [preparing, setPreparing] = useState(false)
  const busy = preparing || enhancer.busy
  const start = async () => {
    setPreparing(true)
    // Photo pages always use fast mode: with images, the detailed reasoning takes minutes.
    try { await onEnhance(true) } finally { setPreparing(false) }
  }
  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex items-center justify-between gap-2'>
        <Label htmlFor={id}>{enhanced ? 'Prompt mejorado' : label}</Label>
        <div className='flex gap-1'>
          {enhanced && !busy && (
            <Button type='button' variant='ghost' size='xs' onClick={() => onRawChange(null)}>
              <Undo2Icon /> Deshacer
            </Button>
          )}
          <Button
            type='button'
            variant='outline'
            size='xs'
            disabled={!canEnhance || busy}
            onClick={start}
            title={canEnhance ? 'Reescribe la instrucción mirando las imágenes (~30 s)' : enhanceHint}
          >
            <WandSparklesIcon /> Mejorar prompt
          </Button>
        </div>
      </div>
      <div className='ai-field' data-working={busy}>
        <Textarea
          id={id}
          rows={enhanced ? 8 : rows}
          className='max-h-72'
          value={enhanced ? raw : value}
          onChange={(e) => (enhanced ? onRawChange(e.target.value) : onChange(e.target.value))}
          placeholder={placeholder}
        />
      </div>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <span className='min-w-0 flex-1 text-xs text-muted-foreground'>
          {enhanced
            ? 'Se envía tal cual al modelo; puedes editarlo o deshacer para volver a tu texto.'
            : canEnhance
              ? '«Mejorar prompt» mira las imágenes y reescribe la instrucción en inglés detallado.'
              : enhanceHint}
        </span>
      </div>
      <JobStatus job={enhancer.job} onCancel={enhancer.cancel} />
    </div>
  )
}
