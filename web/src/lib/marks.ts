export type Tool = 'brush' | 'ellipse' | 'rect' | 'eraser' | 'pan'
export type MarkMode = 'annotate' | 'mask'

// All coordinates are in the image's natural pixel space.
export type Shape =
  | { kind: 'stroke'; points: number[]; size: number; erase: boolean }
  | { kind: 'ellipse'; x: number; y: number; rx: number; ry: number; size: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; size: number }

export const ANNOTATE_COLOR = '#ff1f1f'
export const MAX_SIDE = 2048

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
    img.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo exportar la imagen'))), type, quality),
  )
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { canvas: c, ctx: c.getContext('2d')! }
}

// Converts any picked image to PNG, capped at MAX_SIDE, so uploads stay small and marks align.
export async function normalizeImage(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob)
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    if (scale === 1 && blob.type === 'image/png') return blob
    const { canvas, ctx } = makeCanvas(Math.round(img.naturalWidth * scale), Math.round(img.naturalHeight * scale))
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvasToBlob(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}

// The prompt enhancer only needs to "see" the images; small JPEGs keep it fast on the GTX 1070.
export async function toEnhancerImage(blob: Blob, maxSide = 768): Promise<Blob> {
  const url = URL.createObjectURL(blob)
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const { canvas, ctx } = makeCanvas(Math.round(img.naturalWidth * scale), Math.round(img.naturalHeight * scale))
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvasToBlob(canvas, 'image/jpeg', 0.9)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function drawShapes(ctx: CanvasRenderingContext2D, shapes: Shape[], color: string, fillShapes: boolean) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of shapes) {
    ctx.globalCompositeOperation = s.kind === 'stroke' && s.erase ? 'destination-out' : 'source-over'
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = s.size
    ctx.beginPath()
    if (s.kind === 'stroke') {
      const [x0, y0, ...rest] = s.points
      ctx.moveTo(x0, y0)
      if (rest.length === 0) ctx.lineTo(x0 + 0.01, y0)
      for (let i = 0; i < rest.length; i += 2) ctx.lineTo(rest[i], rest[i + 1])
      ctx.stroke()
    } else if (s.kind === 'ellipse') {
      ctx.ellipse(s.x, s.y, Math.max(1, s.rx), Math.max(1, s.ry), 0, 0, Math.PI * 2)
      if (fillShapes) ctx.fill()
      ctx.stroke()
    } else {
      ctx.rect(s.x, s.y, s.w, s.h)
      if (fillShapes) ctx.fill()
      ctx.stroke()
    }
  }
  ctx.globalCompositeOperation = 'source-over'
}

function marksLayer(w: number, h: number, shapes: Shape[], color: string, fillShapes: boolean) {
  const { canvas, ctx } = makeCanvas(w, h)
  drawShapes(ctx, shapes, color, fillShapes)
  return canvas
}

export async function exportAnnotated(img: HTMLImageElement, shapes: Shape[]) {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const { canvas, ctx } = makeCanvas(w, h)
  ctx.drawImage(img, 0, 0)
  ctx.drawImage(marksLayer(w, h, shapes, ANNOTATE_COLOR, false), 0, 0)
  return canvasToBlob(canvas)
}

export async function exportMask(img: HTMLImageElement, shapes: Shape[]) {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const { canvas, ctx } = makeCanvas(w, h)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(marksLayer(w, h, shapes, '#fff', true), 0, 0)
  return canvasToBlob(canvas)
}

export const hasVisibleMarks = (shapes: Shape[]) => shapes.some((s) => !(s.kind === 'stroke' && s.erase))

// WhatsApp stickers: 512x512 WebP, subject centered with transparent padding.
export async function toStickerWebp(src: string) {
  const img = await loadImage(src)
  const size = 512
  const margin = 16
  const scale = Math.min((size - margin * 2) / img.naturalWidth, (size - margin * 2) / img.naturalHeight)
  const w = img.naturalWidth * scale
  const h = img.naturalHeight * scale
  const { canvas, ctx } = makeCanvas(size, size)
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
  return canvasToBlob(canvas, 'image/webp', 0.9)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
