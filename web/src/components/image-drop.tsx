import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ImagePlusIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PickedImage {
  blob: Blob
  url: string
}

function toPicked(blob: Blob): PickedImage {
  return { blob, url: URL.createObjectURL(blob) }
}

function imagesFrom(list: FileList | DataTransferItemList | null | undefined): Blob[] {
  if (!list) return []
  const out: Blob[] = []
  for (const item of Array.from(list as ArrayLike<File | DataTransferItem>)) {
    const file = item instanceof File ? item : item.kind === 'file' ? item.getAsFile() : null
    if (file && file.type.startsWith('image/')) out.push(file)
  }
  return out
}

interface ImageDropProps {
  value: PickedImage | null
  onChange: (img: PickedImage | null) => void
  label: string
  hint?: string
  // Only one drop zone per screen should listen to Ctrl+V.
  acceptPaste?: boolean
  className?: string
  // Fill the parent's height instead of a fixed square (large, standalone drop zones).
  fill?: boolean
  // Replaces the default upload icon in the empty state.
  emptyIcon?: ReactNode
}

export function ImageDrop({ value, onChange, label, hint, acceptPaste, className, fill, emptyIcon }: ImageDropProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!acceptPaste) return
    const onPaste = (e: ClipboardEvent) => {
      const [img] = imagesFrom(e.clipboardData?.items)
      if (img) onChange(toPicked(img))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [acceptPaste, onChange])

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className='text-sm font-medium'>{label}</span>
      <div
        role='button'
        tabIndex={0}
        aria-label={value ? `${label}: cambiar imagen` : `${label}: subir imagen`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const [img] = imagesFrom(e.dataTransfer.files)
          if (img) onChange(toPicked(img))
        }}
        className={cn(
          fill ? 'min-h-80 flex-1' : 'aspect-square',
          'group relative flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/30 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          dragging && 'border-primary bg-primary/5',
        )}
      >
        {value ? (
          <>
            <img src={value.url} alt={label} className='size-full object-contain' />
            <button
              type='button'
              aria-label={`Quitar ${label}`}
              onClick={(e) => { e.stopPropagation(); onChange(null) }}
              className='absolute top-2 right-2 rounded-full bg-background/80 p-1 opacity-0 shadow transition-opacity group-hover:opacity-100 focus-visible:opacity-100'
            >
              <XIcon className='size-4' />
            </button>
          </>
        ) : (
          <div className='flex flex-col items-center gap-2 p-4 text-center text-muted-foreground'>
            {emptyIcon ?? <ImagePlusIcon className='size-6' />}
            <span className='text-xs'>{hint ?? `Arrastra, sube${acceptPaste ? ' o pega (Ctrl+V)' : ''}`}</span>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type='file'
        accept='image/*'
        hidden
        onChange={(e) => {
          const [img] = imagesFrom(e.target.files)
          if (img) onChange(toPicked(img))
          e.target.value = ''
        }}
      />
    </div>
  )
}
