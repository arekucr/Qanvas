import { useState } from 'react'
import { toast } from 'sonner'
import { SparklesIcon, Undo2Icon, WandSparklesIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { EnhanceModeToggle } from '@/components/enhance-mode-toggle'
import { JobStatus } from '@/components/job-status'
import { QualitySelect } from '@/components/quality-select'
import { ResultPanel } from '@/components/result-panel'
import { useEnhanceMode } from '@/hooks/use-enhance-mode'
import { useJob } from '@/hooks/use-job'
import type { Quality } from '@/lib/api'

// Includes every ratio the prompt enhancer may recommend.
const RATIOS = ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '4:5', '5:4', '2:1', '1:2', '21:9', '9:21', '3:1', '1:3']

export function GeneratePage({ onEdit }: { onEdit: (url: string) => void }) {
  const [prompt, setPrompt] = useState('')
  const [ratio, setRatio] = useState('1:1')
  const [quality, setQuality] = useState<Quality>('preview')
  const [seed, setSeed] = useState('')
  const [original, setOriginal] = useState<string | null>(null)
  const { fast, setFast } = useEnhanceMode()
  const { job, run, rerun, cancel, busy } = useJob()
  const enhancer = useJob((done) => {
    const text = done.result?.text
    if (!text?.positive_prompt) return
    setOriginal(done.params.prompt as string)
    setPrompt(text.positive_prompt)
    if (RATIOS.includes(text.wh_ratio)) setRatio(text.wh_ratio)
    toast.success(`Prompt mejorado${text.wh_ratio ? ` · relación ${text.wh_ratio}` : ''}`)
  })

  const submit = () => {
    const params: Record<string, unknown> = { prompt, ratio, quality }
    if (seed.trim()) params.seed = Number(seed)
    run('t2i', params)
  }

  return (
    <div className='grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)] 2xl:grid-cols-[440px_minmax(0,1fr)]'>
      <Card>
        <CardHeader>
          <CardTitle>Texto a imagen</CardTitle>
          <CardDescription>Describe la imagen. Funciona mejor en inglés y con detalle.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className='flex flex-col gap-5'
            onSubmit={(e) => { e.preventDefault(); submit() }}
          >
            <div className='flex flex-col gap-1.5'>
              <div className='flex items-center justify-between gap-2'>
                <Label htmlFor='prompt'>Prompt</Label>
                <div className='flex gap-1'>
                  {original !== null && !enhancer.busy && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='xs'
                      onClick={() => { setPrompt(original); setOriginal(null) }}
                    >
                      <Undo2Icon /> Deshacer
                    </Button>
                  )}
                  <Button
                    type='button'
                    variant='outline'
                    size='xs'
                    disabled={!prompt.trim() || enhancer.busy}
                    onClick={() => enhancer.run('enhance', { prompt, fast })}
                  >
                    <WandSparklesIcon /> Mejorar prompt
                  </Button>
                </div>
              </div>
              <div className='ai-field' data-working={enhancer.busy}>
                <Textarea
                  id='prompt'
                  rows={6}
                  className='max-h-72'
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder='A neon shop sign that reads "OPEN", rainy night, reflections on wet pavement'
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && prompt.trim() && !busy) submit()
                  }}
                />
              </div>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <span className='min-w-0 flex-1 text-xs text-muted-foreground'>
                  Ctrl+Enter para generar. «Mejorar prompt» acepta cualquier idioma ({fast ? '~15 s' : '~1 min'}).
                </span>
                <EnhanceModeToggle fast={fast} onChange={setFast} disabled={enhancer.busy} />
              </div>
              <JobStatus job={enhancer.job} onCancel={enhancer.cancel} />
            </div>
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='ratio'>Relación de aspecto</Label>
              <Select value={ratio} onValueChange={setRatio}>
                <SelectTrigger id='ratio' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATIOS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <QualitySelect value={quality} onChange={setQuality} />
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor='seed'>Semilla (opcional)</Label>
              <Input
                id='seed'
                inputMode='numeric'
                value={seed}
                onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))}
                placeholder='Aleatoria'
              />
            </div>
            <Button variant='ai' type='submit' size='lg' disabled={!prompt.trim() || busy}>
              <SparklesIcon /> Generar
            </Button>
          </form>
        </CardContent>
      </Card>
      <ResultPanel
        job={job}
        onRerun={busy ? undefined : rerun}
        onCancel={cancel}
        onEdit={onEdit}
        emptyText='La imagen aparecerá aquí. La primera generación tarda más porque carga los modelos.'
      />
    </div>
  )
}
