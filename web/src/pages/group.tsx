import { useState } from 'react'
import { PlusIcon, SparklesIcon, XIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ConsentCheck } from '@/components/consent-check'
import { EnhancedPromptField } from '@/components/enhanced-prompt-field'
import { ImageDrop, type PickedImage } from '@/components/image-drop'
import { QualitySelect } from '@/components/quality-select'
import { ResultPanel } from '@/components/result-panel'
import { useJob } from '@/hooks/use-job'
import type { Quality } from '@/lib/api'
import { normalizeImage, toEnhancerImage } from '@/lib/marks'

interface Person {
  photo: PickedImage | null
  position: string
}

const MAX_PEOPLE = 10
const SOFT_LIMIT = 5

export function GroupPage({ onEdit }: { onEdit: (url: string) => void }) {
  const [people, setPeople] = useState<Person[]>([{ photo: null, position: 'on the left' }, { photo: null, position: 'on the right' }])
  const [scene, setScene] = useState('')
  const [consent, setConsent] = useState(false)
  const [quality, setQuality] = useState<Quality>('preview')
  const [raw, setRaw] = useState<string | null>(null)
  const { job, run, rerun, cancel, busy } = useJob()
  const enhancer = useJob((done) => {
    const text = done.result?.text?.positive_prompt
    if (text) setRaw(text)
  })

  const update = (i: number, patch: Partial<Person>) =>
    setPeople((all) => all.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  const ready = people.filter((p) => p.photo)
  const photosReady = ready.length >= 2 && ready.length === people.length
  const canSubmit = photosReady && (scene.trim() || raw?.trim()) && consent
  const positions = people.map((p) => p.position.trim())

  const enhance = async (fast: boolean) => {
    const images = await Promise.all(people.map((p) => toEnhancerImage(p.photo!.blob)))
    enhancer.run('enhance', { target: 'group', prompt: scene, positions, consent, quality, fast }, images)
  }

  const submit = async () => {
    const images = await Promise.all(people.map((p) => normalizeImage(p.photo!.blob)))
    run('group', { prompt: scene, rawPrompt: raw ?? undefined, positions, consent, quality }, images)
  }

  return (
    <div className='grid items-start gap-6 lg:grid-cols-[460px_minmax(0,1fr)] 2xl:grid-cols-[520px_minmax(0,1fr)]'>
      <Card>
        <CardHeader>
          <CardTitle>Varias personas en una escena</CardTitle>
          <CardDescription>Cada foto se numera como imagen 1, 2, 3… en el prompt.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-5'>
          <div className='grid grid-cols-2 gap-3'>
            {people.map((p, i) => (
              <div key={i} className='relative flex flex-col gap-1.5'>
                <ImageDrop label={`Persona ${i + 1}`} value={p.photo} onChange={(photo) => update(i, { photo })} />
                <Input
                  aria-label={`Posición de la persona ${i + 1}`}
                  value={p.position}
                  onChange={(e) => update(i, { position: e.target.value })}
                  placeholder='in the center'
                />
                {people.length > 2 && (
                  <Button
                    variant='ghost'
                    size='icon-xs'
                    className='absolute top-0 right-0'
                    aria-label={`Quitar persona ${i + 1}`}
                    onClick={() => setPeople((all) => all.filter((_, j) => j !== i))}
                  >
                    <XIcon />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button
            variant='outline'
            disabled={people.length >= MAX_PEOPLE}
            onClick={() => setPeople((all) => [...all, { photo: null, position: '' }])}
          >
            <PlusIcon /> Añadir persona
          </Button>
          {people.length > SOFT_LIMIT && (
            <Alert>
              <AlertDescription className='text-xs'>
                Con más de {SOFT_LIMIT} personas la identidad de cada una se degrada.
              </AlertDescription>
            </Alert>
          )}
          <EnhancedPromptField
            id='scene'
            label='Escena'
            value={scene}
            onChange={setScene}
            placeholder='Friends toasting at a beach bar during sunset, candid photo'
            raw={raw}
            onRawChange={setRaw}
            canEnhance={photosReady && !!scene.trim() && consent}
            enhanceHint='Sube todas las fotos, escribe la escena y marca el permiso para poder mejorar el prompt.'
            onEnhance={enhance}
            enhancer={enhancer}
          />
          <QualitySelect value={quality} onChange={setQuality} />
          <ConsentCheck checked={consent} onChange={setConsent} />
          <Button variant='ai' size='lg' disabled={!canSubmit || busy} onClick={submit}>
            <SparklesIcon /> Crear escena
          </Button>
        </CardContent>
      </Card>
      <ResultPanel job={job} onRerun={busy ? undefined : rerun} onCancel={cancel} onEdit={onEdit} emptyText='La foto grupal aparecerá aquí.' />
    </div>
  )
}
