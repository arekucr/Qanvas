import { useState } from 'react'
import { toast } from 'sonner'
import { SmileIcon, SparklesIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ImageDrop, type PickedImage } from '@/components/image-drop'
import { QualitySelect } from '@/components/quality-select'
import { ResultPanel } from '@/components/result-panel'
import { useJob } from '@/hooks/use-job'
import type { Quality } from '@/lib/api'
import { downloadBlob, normalizeImage, toStickerWebp } from '@/lib/marks'

export function StickersPage({ onEdit }: { onEdit: (url: string) => void }) {
  const [tab, setTab] = useState<'extract' | 'generate'>('extract')
  const [photo, setPhoto] = useState<PickedImage | null>(null)
  const [description, setDescription] = useState('')
  const [cartoon, setCartoon] = useState(false)
  const [quality, setQuality] = useState<Quality>('preview')
  const { job, run, rerun, cancel, busy } = useJob()

  const canSubmit = tab === 'extract' ? !!photo : !!description.trim()

  const submit = async () => {
    if (tab === 'extract' && photo) {
      run('sticker_extract', { cartoon, quality }, [await normalizeImage(photo.blob)])
    } else {
      run('sticker_generate', { prompt: description, cartoon, quality })
    }
  }

  const webp = async (url: string) => {
    try {
      downloadBlob(await toStickerWebp(url), `sticker-${job?.id.slice(0, 8)}.webp`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className='grid items-start gap-6 lg:grid-cols-[380px_minmax(0,1fr)] 2xl:grid-cols-[440px_minmax(0,1fr)]'>
      <Card>
        <CardHeader>
          <CardTitle>Stickers con fondo transparente</CardTitle>
          <CardDescription>Extrae el sujeto de una foto o genera uno desde texto.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-5'>
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'extract' | 'generate')}>
            <TabsList className='w-full'>
              <TabsTrigger value='extract'>Desde foto</TabsTrigger>
              <TabsTrigger value='generate'>Desde texto</TabsTrigger>
            </TabsList>
            <TabsContent value='extract' className='pt-3'>
              <ImageDrop label='Foto' acceptPaste value={photo} onChange={setPhoto} />
            </TabsContent>
            <TabsContent value='generate' className='flex flex-col gap-1.5 pt-3'>
              <Label htmlFor='sticker-desc'>Descripción</Label>
              <div className='ai-field'>
                <Textarea
                  id='sticker-desc'
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder='A cute cartoon sloth giving a thumbs up'
                />
              </div>
            </TabsContent>
          </Tabs>
          <div className='flex items-center justify-between gap-3'>
            <Label htmlFor='cartoon' className='flex flex-col items-start gap-0.5'>
              Estilo cartoon con borde blanco
              <span className='text-xs font-normal text-muted-foreground'>Estilo clásico de sticker</span>
            </Label>
            <Switch id='cartoon' checked={cartoon} onCheckedChange={setCartoon} />
          </div>
          <QualitySelect value={quality} onChange={setQuality} />
          <Button variant='ai' size='lg' disabled={!canSubmit || busy} onClick={submit}>
            <SparklesIcon /> Crear sticker
          </Button>
        </CardContent>
      </Card>
      <ResultPanel
        job={job}
        onRerun={busy ? undefined : rerun}
        onCancel={cancel}
        onEdit={onEdit}
        transparent
        emptyText='El sticker aparecerá aquí con fondo transparente.'
        extraActions={(url) => (
          <Button variant='outline' onClick={() => webp(url)}>
            <SmileIcon /> WebP 512 (WhatsApp)
          </Button>
        )}
      />
    </div>
  )
}
