import { cn } from '@/lib/utils'

export const APP_NAME = 'Qanvas'

const ROBOT_WIDTHS = [48, 64, 96, 128, 192, 256, 384, 512]
const WORDMARK_WIDTHS = [96, 192, 288, 384, 768]
const srcSet = (name: string, widths: number[]) => widths.map((w) => `/brand/${name}-${w}.webp ${w}w`).join(', ')

// Robot mascot. `size` is the rendered size in CSS px; the browser picks the right file for the screen density.
export function Mascot({ size, className, alt = '' }: { size: number; className?: string; alt?: string }) {
  return (
    <img
      src={`/brand/qanvas-robot-${ROBOT_WIDTHS.find((w) => w >= size) ?? 512}.webp`}
      srcSet={srcSet('qanvas-robot', ROBOT_WIDTHS)}
      sizes={`${size}px`}
      width={size}
      height={size}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      draggable={false}
      className={cn('select-none object-contain', className)}
      style={{ width: size, height: size }}
    />
  )
}

const WORDMARK_RATIO = 3.04

// "Qanvas" wordmark. `height` is the rendered height in CSS px.
export function Wordmark({ height, className }: { height: number; className?: string }) {
  const width = Math.round(height * WORDMARK_RATIO)
  return (
    <img
      src='/brand/qanvas-wordmark-192.webp'
      srcSet={srcSet('qanvas-wordmark', WORDMARK_WIDTHS)}
      sizes={`${width}px`}
      width={width}
      height={height}
      alt={APP_NAME}
      draggable={false}
      className={cn('select-none object-contain', className)}
      style={{ height, width: 'auto' }}
    />
  )
}
