import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { DownloadIcon, ExpandIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ImageViewer } from '@/components/image-viewer'
import { CHECKERBOARD } from '@/lib/styles'
import { cn } from '@/lib/utils'

interface LightboxProps {
  src: string | null
  onClose: () => void
  transparent?: boolean
  filename?: string
}

// "Cinema mode": black backdrop over the whole window, optional browser fullscreen.
export function Lightbox({ src, onClose, transparent, filename = 'qwen.png' }: LightboxProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })

  useEffect(() => {
    if (!src) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement) closeRef.current() }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    rootRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [src])

  if (!src) return null

  const toggleBrowserFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else rootRef.current?.requestFullscreen().catch(() => {})
  }

  return createPortal(
    <div
      ref={rootRef}
      tabIndex={-1}
      role='dialog'
      aria-modal='true'
      aria-label='Imagen en pantalla completa'
      className='fixed inset-0 z-[100] flex flex-col bg-black text-white outline-none'
    >
      <div className='absolute top-3 right-3 z-10 flex gap-1 rounded-lg bg-black/60 p-1'>
        <Button variant='ghost' size='icon-sm' className='text-white hover:bg-white/20 hover:text-white' asChild>
          <a href={src} download={filename} aria-label='Descargar'><DownloadIcon /></a>
        </Button>
        <Button variant='ghost' size='icon-sm' className='text-white hover:bg-white/20 hover:text-white' onClick={toggleBrowserFullscreen} aria-label='Pantalla completa del navegador'>
          <ExpandIcon />
        </Button>
        <Button variant='ghost' size='icon-sm' className='text-white hover:bg-white/20 hover:text-white' onClick={onClose} aria-label='Cerrar (Esc)'>
          <XIcon />
        </Button>
      </div>
      <ImageViewer src={src} alt='Imagen en pantalla completa' className={cn('flex-1', transparent && CHECKERBOARD)} />
    </div>,
    document.body,
  )
}
