import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { MaximizeIcon, MinusIcon, PlusIcon, ScanIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MIN = 1
const MAX = 8

interface View { s: number; x: number; y: number }
const FIT: View = { s: 1, x: 0, y: 0 }

interface ImageViewerProps {
  src: string
  alt: string
  className?: string
  imgClassName?: string
  onFullscreen?: () => void
  toolbarExtra?: ReactNode
}

// Zoom with the wheel or buttons (toward the cursor), pan by dragging, double click toggles 1x/3x.
export function ImageViewer({ src, alt, className, imgClassName, onFullscreen, toolbarExtra }: ImageViewerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>(FIT)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const [shownSrc, setShownSrc] = useState(src)
  if (shownSrc !== src) {
    setShownSrc(src)
    setView(FIT)
    setDims(null)
  }

  const clamp = useCallback((v: View): View => {
    const el = ref.current
    if (!el || v.s <= MIN) return FIT
    const mx = ((v.s - 1) * el.clientWidth) / 2
    const my = ((v.s - 1) * el.clientHeight) / 2
    return { s: v.s, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) }
  }, [])

  // Keeps the point under (px, py), relative to the container, fixed while scaling.
  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    const el = ref.current
    if (!el) return
    setView((v) => {
      const s = Math.max(MIN, Math.min(MAX, v.s * factor))
      const cx = el.clientWidth / 2
      const cy = el.clientHeight / 2
      const ox = (px ?? cx) - cx
      const oy = (py ?? cy) - cy
      return clamp({ s, x: ox - (ox - v.x) * (s / v.s), y: oy - (oy - v.y) * (s / v.s) })
    })
  }, [clamp])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  const zoomed = view.s > MIN

  return (
    <div className={cn('group relative overflow-hidden', className)}>
      <div
        ref={ref}
        className={cn('absolute inset-0 touch-none select-none', zoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in')}
        onPointerDown={(e) => {
          if (!zoomed) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y }
          setDragging(true)
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          setView((v) => clamp({ ...v, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }))
        }}
        onPointerUp={() => { drag.current = null; setDragging(false) }}
        onDoubleClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          if (zoomed) setView(FIT)
          else zoomAt(3, e.clientX - r.left, e.clientY - r.top)
        }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          className={cn('absolute inset-0 size-full object-contain', !dragging && 'transition-transform duration-75', imgClassName)}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
        />
      </div>

      {dims && (
        <span className='pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white tabular-nums'>
          {dims.w}×{dims.h}
        </span>
      )}
      <div className='absolute right-2 bottom-2 flex items-center gap-1 rounded-lg bg-black/60 p-1 text-white opacity-80 transition-opacity group-hover:opacity-100 focus-within:opacity-100'>
        {toolbarExtra}
        <Button size='icon-xs' variant='ghost' className='text-white hover:bg-white/20 hover:text-white' onClick={() => zoomAt(1 / 1.5)} disabled={!zoomed} aria-label='Alejar'>
          <MinusIcon />
        </Button>
        <span className='w-10 text-center text-xs tabular-nums'>{Math.round(view.s * 100)}%</span>
        <Button size='icon-xs' variant='ghost' className='text-white hover:bg-white/20 hover:text-white' onClick={() => zoomAt(1.5)} disabled={view.s >= MAX} aria-label='Acercar'>
          <PlusIcon />
        </Button>
        <Button size='icon-xs' variant='ghost' className='text-white hover:bg-white/20 hover:text-white' onClick={() => setView(FIT)} disabled={!zoomed} aria-label='Ajustar a la vista'>
          <ScanIcon />
        </Button>
        {onFullscreen && (
          <Button size='icon-xs' variant='ghost' className='text-white hover:bg-white/20 hover:text-white' onClick={onFullscreen} aria-label='Pantalla completa'>
            <MaximizeIcon />
          </Button>
        )}
      </div>
    </div>
  )
}
