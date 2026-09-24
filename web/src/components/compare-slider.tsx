import { useState } from 'react'

export function CompareSlider({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50)
  return (
    <div className='flex flex-col gap-2'>
      <div className='relative mx-auto w-fit overflow-hidden rounded-md border'>
        <img src={after} alt='Después' className='block max-h-[calc(100dvh-16rem)] w-auto select-none' draggable={false} />
        <img
          src={before}
          alt='Antes'
          draggable={false}
          className='absolute inset-0 size-full select-none object-fill'
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        />
        <div className='pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow' style={{ left: `${pos}%` }} />
        <span className='absolute top-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white'>Antes</span>
        <span className='absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white'>Después</span>
      </div>
      <input
        type='range'
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label='Comparar antes y después'
        className='w-full accent-primary'
      />
    </div>
  )
}
