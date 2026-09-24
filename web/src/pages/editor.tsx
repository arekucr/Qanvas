import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  BrushIcon, CircleIcon, DicesIcon, GemIcon, EraserIcon, HandIcon, ImagePlusIcon, MaximizeIcon, PlusIcon, RotateCcwIcon, ScalingIcon, SparklesIcon, SquareIcon, Trash2Icon, Undo2Icon, XIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Mascot } from '@/components/brand'
import { CompareSlider } from '@/components/compare-slider'
import { GenerationInfo } from '@/components/generation-info'
import { EnhancedPromptField } from '@/components/enhanced-prompt-field'
import { ImageDrop, type PickedImage } from '@/components/image-drop'
import { JobStatus } from '@/components/job-status'
import { Lightbox } from '@/components/lightbox'
import { QualitySelect } from '@/components/quality-select'
import { MarkCanvas } from '@/components/editor/mark-canvas'
import { useJob } from '@/hooks/use-job'
import { canFinalize, canRerun, fetchBlob, FINAL_STEPS, outputUrls, type Quality } from '@/lib/api'
import {
  exportAnnotated, exportMask, hasVisibleMarks, loadImage, normalizeImage, toEnhancerImage, type MarkMode, type Shape, type Tool,
} from '@/lib/marks'
import { cn } from '@/lib/utils'

interface Version {
  blob: Blob
  url: string
  label: string
  // Job that produced this version, for the details panel.
  jobId?: string
}

const MAX_REFS = 8

function buildPrompt(instruction: string, marks: MarkMode | null) {
  if (marks === 'annotate') {
    return `Edit <image1>. <image2> is the same picture with red marks that show the area to change. Instruction: ${instruction}. Only change the marked area, keep everything else identical, and do not draw any red marks in the result.`
  }
  if (marks === 'mask') {
    return `Edit <image1>. <image2> is a black and white mask: only change the white area. Instruction: ${instruction}. Keep everything outside the white area identical.`
  }
  return instruction
}

export function EditorPage({ seedUrl, onSeedConsumed }: { seedUrl: string | null; onSeedConsumed: () => void }) {
  const [versions, setVersions] = useState<Version[]>([])
  const [current, setCurrent] = useState(0)
  const [loaded, setLoaded] = useState<{ url: string; img: HTMLImageElement } | null>(null)
  const [shapes, setShapes] = useState<Shape[]>([])
  const [tool, setTool] = useState<Tool>('brush')
  const [mode, setMode] = useState<MarkMode>('annotate')
  const [brushPct, setBrushPct] = useState(1.5)
  const [refs, setRefs] = useState<(PickedImage | null)[]>([])
  const [prompt, setPrompt] = useState('')
  const [quality, setQuality] = useState<Quality>('preview')
  const [view, setView] = useState<'edit' | 'compare'>('edit')
  const [fullscreen, setFullscreen] = useState(false)

  // Upscaled results keep their full size; everything is normalized again when sent to the model.
  const addVersion = useCallback(async (blob: Blob, label?: string, normalize = true, jobId?: string) => {
    const normalized = normalize ? await normalizeImage(blob) : blob
    setVersions((v) => {
      setCurrent(v.length)
      return [...v, { blob: normalized, url: URL.createObjectURL(normalized), label: label ?? `Edición ${v.length}`, jobId }]
    })
    setShapes([])
  }, [])

  const { job, run, rerun, cancel, busy } = useJob(async (done) => {
    const [url] = outputUrls(done)
    if (!url) return
    try {
      await addVersion(await fetchBlob(url), Number(done.params.steps) >= FINAL_STEPS ? 'Final' : undefined, true, done.id)
      setView('compare')
    } catch (err) {
      toast.error((err as Error).message)
    }
  })

  const [raw, setRaw] = useState<string | null>(null)
  const enhancer = useJob((done) => {
    const text = done.result?.text?.positive_prompt
    if (text) setRaw(text)
  })

  const upscaler = useJob(async (done) => {
    const [url] = outputUrls(done)
    if (!url) return
    try {
      await addVersion(await fetchBlob(url), 'Ampliada 2×', false, done.id)
      setView('compare')
    } catch (err) {
      toast.error((err as Error).message)
    }
  })

  useEffect(() => {
    if (!seedUrl) return
    fetchBlob(seedUrl)
      .then((b) => { setVersions([]); return addVersion(b, 'Original') })
      .catch((err) => toast.error(err.message))
      .finally(onSeedConsumed)
  }, [seedUrl, addVersion, onSeedConsumed])

  const active = versions[current]
  const img = loaded && loaded.url === active?.url ? loaded.img : null
  useEffect(() => {
    if (!active) return
    let alive = true
    loadImage(active.url).then((i) => { if (alive) setLoaded({ url: active.url, img: i }) })
    return () => { alive = false }
  }, [active])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        setShapes((s) => s.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const marked = hasVisibleMarks(shapes)
  const refStart = marked ? 3 : 2
  const brushSize = img ? Math.max(2, (brushPct / 100) * Math.max(img.naturalWidth, img.naturalHeight)) : 10

  // Same image order for the edit and for the enhancer: base, marks (if any), references.
  const collectImages = async (prepare: (b: Blob) => Promise<Blob>) => {
    if (!img || !active) return []
    const images: Blob[] = [await prepare(active.blob)]
    if (marked) images.push(await prepare(mode === 'annotate' ? await exportAnnotated(img, shapes) : await exportMask(img, shapes)))
    for (const r of refs) if (r) images.push(await prepare(r.blob))
    return images
  }
  const composed = () => buildPrompt(prompt.trim(), marked ? mode : null)

  const submit = async () => {
    const images = await collectImages(normalizeImage)
    if (images.length) run('edit', { prompt: raw?.trim() || composed(), quality }, images)
  }

  const enhance = async (fast: boolean) => {
    const images = await collectImages((b) => toEnhancerImage(b))
    if (images.length) enhancer.run('enhance', { target: 'edit', prompt: composed(), quality, fast }, images)
  }

  if (!active) {
    return (
      <Card className='lg:min-h-[calc(100dvh-8.5rem)]'>
        <CardHeader>
          <CardTitle>Editor con IA</CardTitle>
          <CardDescription>Sube, arrastra o pega (Ctrl+V) la imagen que quieres editar.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-1 flex-col'>
          <ImageDrop
            label='Imagen base'
            acceptPaste
            fill
            className='flex-1'
            emptyIcon={<Mascot size={176} />}
            hint='Arrastra una imagen aquí, haz clic para subirla o pégala con Ctrl+V'
            value={null}
            onChange={(p) => p && addVersion(p.blob, 'Original').catch((err) => toast.error(err.message))}
          />
        </CardContent>
      </Card>
    )
  }

  const previous = versions[current - 1]

  return (
    <div className='grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_420px]'>
      <div className='flex min-w-0 flex-col gap-4'>
        <Card>
          <CardContent className='flex flex-col gap-3'>
            <div className='flex flex-wrap items-center gap-2'>
              <Tabs value={view} onValueChange={(v) => setView(v as 'edit' | 'compare')}>
                <TabsList>
                  <TabsTrigger value='edit'>Marcar</TabsTrigger>
                  <TabsTrigger value='compare' disabled={!previous}>Antes / después</TabsTrigger>
                </TabsList>
              </Tabs>
              {view === 'edit' && (
                <>
                  <ToggleGroup type='single' variant='outline' value={tool} onValueChange={(v) => v && setTool(v as Tool)} aria-label='Herramienta'>
                    <ToggleGroupItem value='pan' aria-label='Mover (con zoom)'><HandIcon /></ToggleGroupItem>
                    <ToggleGroupItem value='brush' aria-label='Pincel'><BrushIcon /></ToggleGroupItem>
                    <ToggleGroupItem value='ellipse' aria-label='Círculo'><CircleIcon /></ToggleGroupItem>
                    <ToggleGroupItem value='rect' aria-label='Rectángulo'><SquareIcon /></ToggleGroupItem>
                    <ToggleGroupItem value='eraser' aria-label='Borrador'><EraserIcon /></ToggleGroupItem>
                  </ToggleGroup>
                  <div className='flex w-36 items-center gap-2'>
                    <Label className='sr-only' htmlFor='brush'>Grosor</Label>
                    <Slider id='brush' min={0.3} max={6} step={0.1} value={[brushPct]} onValueChange={([v]) => setBrushPct(v)} />
                  </div>
                  <Button variant='ghost' size='icon' onClick={() => setShapes((s) => s.slice(0, -1))} disabled={!shapes.length} aria-label='Deshacer (Ctrl+Z)'>
                    <Undo2Icon />
                  </Button>
                  <Button variant='ghost' size='icon' onClick={() => setShapes([])} disabled={!shapes.length} aria-label='Borrar marcas'>
                    <Trash2Icon />
                  </Button>
                </>
              )}
              <div className='ml-auto flex flex-wrap gap-2'>
                {active.jobId && <GenerationInfo key={active.jobId} jobId={active.jobId} triggerClassName='size-8' />}
                <Button variant='outline' size='sm' onClick={() => setFullscreen(true)}>
                  <MaximizeIcon /> Pantalla completa
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => upscaler.run('upscale', {}, [active.blob])}
                  disabled={upscaler.busy || busy || (!!img && Math.max(img.naturalWidth, img.naturalHeight) > 2048)}
                  title='Amplía la versión actual al doble con Real-ESRGAN'
                >
                  <ScalingIcon /> Ampliar 2×
                </Button>
                <Button variant='outline' size='sm' onClick={() => { setVersions([]); setShapes([]); setCurrent(0) }}>
                  <ImagePlusIcon /> Nueva imagen
                </Button>
              </div>
            </div>
            {view === 'compare' && previous ? (
              <CompareSlider before={previous.url} after={active.url} />
            ) : img ? (
              <MarkCanvas key={active.url} image={img} shapes={shapes} onAdd={(s) => setShapes((prev) => [...prev, s])} tool={tool} mode={mode} brushSize={brushSize} />
            ) : null}
          </CardContent>
        </Card>
        <div className='flex gap-2 overflow-x-auto pb-1' aria-label='Versiones'>
          {versions.map((v, i) => (
            <button
              key={v.url}
              type='button'
              onClick={() => { setCurrent(i); setShapes([]) }}
              className={cn('flex shrink-0 flex-col items-center gap-1 rounded-md border p-1 text-xs', i === current && 'ring-2 ring-primary')}
            >
              <img src={v.url} alt={v.label} className='h-16 w-auto rounded' />
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <Card className='h-fit'>
        <CardHeader>
          <CardTitle>Instrucción</CardTitle>
          <CardDescription>
            Marca el área o describe el cambio. Cada resultado se vuelve la nueva base.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-5'>
          <div className='flex flex-col gap-1.5'>
            <Label>Cómo interpretar las marcas</Label>
            <ToggleGroup type='single' variant='outline' value={mode} onValueChange={(v) => v && setMode(v as MarkMode)} className='w-full'>
              <ToggleGroupItem value='annotate' className='flex-1'>Anotación</ToggleGroupItem>
              <ToggleGroupItem value='mask' className='flex-1'>Máscara</ToggleGroupItem>
            </ToggleGroup>
            <span className='text-xs text-muted-foreground'>
              {marked
                ? mode === 'annotate'
                  ? 'Se envía la imagen con trazos rojos como referencia.'
                  : 'Se envía una máscara blanco y negro del área marcada.'
                : 'Sin marcas: la instrucción se aplica a toda la imagen.'}
            </span>
          </div>
          <EnhancedPromptField
            id='instruction'
            label='Instrucción'
            rows={4}
            value={prompt}
            onChange={setPrompt}
            placeholder={marked ? 'Cambia lo marcado por un gato naranja' : 'Cambia el fondo por una playa al atardecer'}
            raw={raw}
            onRawChange={setRaw}
            canEnhance={!!prompt.trim() && !!img}
            enhanceHint='Escribe una instrucción para poder mejorarla.'
            onEnhance={enhance}
            enhancer={enhancer}
          />
          <div className='flex flex-col gap-2'>
            <div className='flex items-center justify-between'>
              <Label>Referencias extra</Label>
              <Button
                variant='ghost'
                size='sm'
                disabled={refs.length >= MAX_REFS}
                onClick={() => setRefs((r) => [...r, null])}
              >
                <PlusIcon /> Añadir
              </Button>
            </div>
            {refs.length === 0 ? (
              <span className='text-xs text-muted-foreground'>Por ejemplo, una prenda o un objeto para insertar.</span>
            ) : (
              <div className='grid grid-cols-2 gap-2'>
                {refs.map((r, i) => (
                  <div key={i} className='relative'>
                    <ImageDrop
                      label={`<image${refStart + i}>`}
                      hint='Subir'
                      value={r}
                      onChange={(p) => setRefs((all) => all.map((x, j) => (j === i ? p : x)))}
                    />
                    <Button
                      variant='ghost'
                      size='icon-xs'
                      className='absolute top-0 right-0'
                      aria-label='Quitar referencia'
                      onClick={() => setRefs((all) => all.filter((_, j) => j !== i))}
                    >
                      <XIcon />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {refs.some(Boolean) && (
              <span className='text-xs text-muted-foreground'>
                Menciónalas en la instrucción, p. ej. <Badge variant='secondary'>{`<image${refStart}>`}</Badge>
              </span>
            )}
          </div>
          <QualitySelect value={quality} onChange={setQuality} />
          <JobStatus job={job} onCancel={cancel} />
          <JobStatus job={upscaler.job} onCancel={upscaler.cancel} />
          <Button variant='ai' size='lg' disabled={!(raw?.trim() || prompt.trim()) || busy} onClick={submit}>
            <SparklesIcon /> Aplicar edición
          </Button>
          {!busy && canRerun(job) && (
            <div className='grid grid-cols-2 gap-2'>
              <Button variant='outline' onClick={() => rerun(job!.id, 'variant')} title='Repite la última edición con otra semilla'>
                <DicesIcon /> Otra variante
              </Button>
              <Button
                variant='outline'
                disabled={!canFinalize(job)}
                onClick={() => rerun(job!.id, 'final')}
                title={`Repite la última edición con la misma semilla y ${FINAL_STEPS} pasos`}
              >
                <GemIcon /> Renderizar final
              </Button>
            </div>
          )}
          {current < versions.length - 1 && (
            <Button variant='outline' onClick={() => setCurrent(versions.length - 1)}>
              <RotateCcwIcon /> Volver a la última versión
            </Button>
          )}
          <Button variant='outline' asChild>
            <a href={active.url} download={`qwen-edit-v${current}.png`}>Descargar versión actual</a>
          </Button>
        </CardContent>
      </Card>
      <Lightbox src={fullscreen ? active.url : null} onClose={() => setFullscreen(false)} filename={`qwen-edit-v${current}.png`} />
    </div>
  )
}

