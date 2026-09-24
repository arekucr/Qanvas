import { useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { Ellipse, Image as KImage, Layer, Line, Rect, Stage } from 'react-konva'
import { MinusIcon, PlusIcon, ScanIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ANNOTATE_COLOR, type MarkMode, type Shape, type Tool } from '@/lib/marks'
import { cn } from '@/lib/utils'

const MASK_PREVIEW_COLOR = '#3b82f6'
const MAX_ZOOM = 8

interface MarkCanvasProps {
  image: HTMLImageElement
  shapes: Shape[]
  onAdd: (shape: Shape) => void
  tool: Tool
  mode: MarkMode
  brushSize: number
}

function useFitScale(image: HTMLImageElement) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const maxH = Math.max(320, window.innerHeight - 260)
      setScale(Math.min(el.clientWidth / image.naturalWidth, maxH / image.naturalHeight, 1))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => { ro.disconnect(); window.removeEventListener('resize', update) }
  }, [image])
  return { ref, scale }
}

function renderShape(s: Shape, key: string | number, mode: MarkMode) {
  const color = mode === 'annotate' ? ANNOTATE_COLOR : MASK_PREVIEW_COLOR
  const fill = mode === 'mask' ? color : undefined
  if (s.kind === 'stroke') {
    return (
      <Line
        key={key}
        points={s.points.length === 2 ? [...s.points, s.points[0] + 0.01, s.points[1]] : s.points}
        stroke={color}
        strokeWidth={s.size}
        lineCap='round'
        lineJoin='round'
        tension={0.2}
        globalCompositeOperation={s.erase ? 'destination-out' : 'source-over'}
      />
    )
  }
  if (s.kind === 'ellipse') {
    return <Ellipse key={key} x={s.x} y={s.y} radiusX={Math.max(1, s.rx)} radiusY={Math.max(1, s.ry)} stroke={color} strokeWidth={s.size} fill={fill} />
  }
  return <Rect key={key} x={s.x} y={s.y} width={s.w} height={s.h} stroke={color} strokeWidth={s.size} fill={fill} />
}

// Remount (key) per image so zoom resets when the base image changes.
export function MarkCanvas({ image, shapes, onAdd, tool, mode, brushSize }: MarkCanvasProps) {
  const { ref, scale: fit } = useFitScale(image)
  const [draft, setDraft] = useState<Shape | null>(null)
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
  const start = useRef<{ x: number; y: number } | null>(null)

  const width = image.naturalWidth * fit
  const height = image.naturalHeight * fit

  const clampPos = (zoom: number, x: number, y: number) => ({
    x: Math.min(0, Math.max(width - width * zoom, x)),
    y: Math.min(0, Math.max(height - height * zoom, y)),
  })

  // Zoom keeping the screen point (px, py) fixed; defaults to the canvas center.
  const zoomTo = (next: number, px = width / 2, py = height / 2) => {
    setView((v) => {
      const zoom = Math.max(1, Math.min(MAX_ZOOM, next))
      const ix = (px - v.x) / (fit * v.zoom)
      const iy = (py - v.y) / (fit * v.zoom)
      return { zoom, ...clampPos(zoom, px - ix * fit * zoom, py - iy * fit * zoom) }
    })
  }

  const pointer = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) =>
    e.target.getStage()?.getRelativePointerPosition() ?? null

  const down = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (tool === 'pan') return
    const p = pointer(e)
    if (!p) return
    start.current = p
    if (tool === 'brush' || tool === 'eraser') {
      setDraft({ kind: 'stroke', points: [p.x, p.y], size: brushSize, erase: tool === 'eraser' })
    }
  }

  const move = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!start.current || tool === 'pan') return
    e.evt.preventDefault()
    const p = pointer(e)
    if (!p) return
    const s = start.current
    if (tool === 'brush' || tool === 'eraser') {
      setDraft((d) => (d && d.kind === 'stroke' ? { ...d, points: [...d.points, p.x, p.y] } : d))
    } else if (tool === 'ellipse') {
      setDraft({ kind: 'ellipse', x: (s.x + p.x) / 2, y: (s.y + p.y) / 2, rx: Math.abs(p.x - s.x) / 2, ry: Math.abs(p.y - s.y) / 2, size: brushSize / 2 })
    } else {
      setDraft({ kind: 'rect', x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y), size: brushSize / 2 })
    }
  }

  const up = () => {
    if (draft) onAdd(draft)
    setDraft(null)
    start.current = null
  }

  const wheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const p = e.target.getStage()?.getPointerPosition()
    zoomTo(view.zoom * (e.evt.deltaY < 0 ? 1.2 : 1 / 1.2), p?.x, p?.y)
  }

  return (
    <div ref={ref} className='flex w-full justify-center'>
      <div className='group relative'>
        <Stage
          width={width}
          height={height}
          scaleX={fit * view.zoom}
          scaleY={fit * view.zoom}
          x={view.x}
          y={view.y}
          draggable={tool === 'pan' && view.zoom > 1}
          dragBoundFunc={(pos) => clampPos(view.zoom, pos.x, pos.y)}
          onDragEnd={(e) => {
            const stage = e.target.getStage()
            if (stage && e.target === stage) setView((v) => ({ ...v, x: stage.x(), y: stage.y() }))
          }}
          onWheel={wheel}
          onMouseDown={down}
          onMouseMove={move}
          onMouseUp={up}
          onMouseLeave={up}
          onTouchStart={down}
          onTouchMove={move}
          onTouchEnd={up}
          className={cn(
            'touch-none overflow-hidden rounded-md border',
            tool === 'pan' ? (view.zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default') : 'cursor-crosshair',
          )}
        >
          <Layer listening={false}>
            <KImage image={image} />
          </Layer>
          <Layer opacity={mode === 'mask' ? 0.5 : 1} listening={false}>
            {shapes.map((s, i) => renderShape(s, i, mode))}
            {draft && renderShape(draft, 'draft', mode)}
          </Layer>
        </Stage>
        <div className='absolute right-2 bottom-2 flex items-center gap-1 rounded-lg bg-black/60 p-1 text-white opacity-80 transition-opacity group-hover:opacity-100 focus-within:opacity-100'>
          <Button size='icon-xs' variant='ghost' className='text-white hover:bg-white/20 hover:text-white' onClick={() => zoomTo(view.zoom / 1.5)} disabled={view.zoom <= 1} aria-label='Alejar'>
            <MinusIcon />
          </Button>
          <span className='w-10 text-center text-xs tabular-nums'>{Math.round(view.zoom * 100)}%</span>
          <Button size='icon-xs' variant='ghost' className='text-white hover:bg-white/20 hover:text-white' onClick={() => zoomTo(view.zoom * 1.5)} disabled={view.zoom >= MAX_ZOOM} aria-label='Acercar'>
            <PlusIcon />
          </Button>
          <Button size='icon-xs' variant='ghost' className='text-white hover:bg-white/20 hover:text-white' onClick={() => setView({ zoom: 1, x: 0, y: 0 })} disabled={view.zoom <= 1} aria-label='Ajustar a la vista'>
            <ScanIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}
