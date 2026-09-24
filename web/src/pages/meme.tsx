import { useState } from 'react'
import { SparklesIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConsentCheck } from '@/components/consent-check'
import { EnhancedPromptField } from '@/components/enhanced-prompt-field'
import { ImageDrop, type PickedImage } from '@/components/image-drop'
import { QualitySelect } from '@/components/quality-select'
import { ResultPanel } from '@/components/result-panel'
import { useJob } from '@/hooks/use-job'
import type { Quality } from '@/lib/api'
import { normalizeImage, toEnhancerImage } from '@/lib/marks'

export function MemePage({ onEdit }: { onEdit: (url: string) => void }) {
  const [meme, setMeme] = useState<PickedImage | null>(null)
  const [face, setFace] = useState<PickedImage | null>(null)
  const [extra, setExtra] = useState('')
  const [consent, setConsent] = useState(false)
  const [quality, setQuality] = useState<Quality>('preview')
  const [raw, setRaw] = useState<string | null>(null)
  const { job, run, rerun, cancel, busy } = useJob()
  const enhancer = useJob((done) => {
    const text = done.result?.text?.positive_prompt
    if (text) setRaw(text)
  })

  const enhance = async (fast: boolean) => {
    if (!meme || !face) return
    const images = [await toEnhancerImage(meme.blob), await toEnhancerImage(face.blob)]
    enhancer.run('enhance', { target: 'meme', prompt: extra, consent, quality, fast }, images)
  }

  const submit = async () => {
    if (!meme || !face) return
    const images = [await normalizeImage(meme.blob), await normalizeImage(face.blob)]
    run('meme', { prompt: extra, rawPrompt: raw ?? undefined, consent, quality }, images)
  }

  return (
    <div className='grid items-start gap-6 lg:grid-cols-[420px_minmax(0,1fr)] 2xl:grid-cols-[480px_minmax(0,1fr)]'>
      <Card>
        <CardHeader>
          <CardTitle>Meme con otra cara</CardTitle>
          <CardDescription>Reemplaza a la persona del meme manteniendo pose, expresión y texto.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-5'>
          <div className='grid grid-cols-2 gap-3'>
            <ImageDrop label='Meme' acceptPaste value={meme} onChange={setMeme} />
            <ImageDrop label='Persona' value={face} onChange={setFace} hint='Foto frontal bien iluminada' />
          </div>
          <Alert>
            <AlertDescription className='text-xs'>
              Funciona mejor con memes de una sola cara y una foto frontal con buena luz.
            </AlertDescription>
          </Alert>
          <EnhancedPromptField
            id='meme-extra'
            label='Ajuste extra (opcional)'
            rows={2}
            value={extra}
            onChange={setExtra}
            placeholder='Keep the glasses from the meme'
            raw={raw}
            onRawChange={setRaw}
            canEnhance={!!meme && !!face && consent}
            enhanceHint='Sube ambas imágenes y marca el permiso para poder mejorar el prompt.'
            onEnhance={enhance}
            enhancer={enhancer}
          />
          <QualitySelect value={quality} onChange={setQuality} />
          <ConsentCheck checked={consent} onChange={setConsent} />
          <Button variant='ai' size='lg' disabled={!meme || !face || !consent || busy} onClick={submit}>
            <SparklesIcon /> Crear meme
          </Button>
        </CardContent>
      </Card>
      <ResultPanel job={job} onRerun={busy ? undefined : rerun} onCancel={cancel} onEdit={onEdit} emptyText='El meme aparecerá aquí.' />
    </div>
  )
}
