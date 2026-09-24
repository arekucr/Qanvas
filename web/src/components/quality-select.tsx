import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Quality } from '@/lib/api'

const OPTIONS: { value: Quality; label: string; hint: string }[] = [
  { value: 'preview', label: 'Rápida', hint: '~0.5 MP, 12 pasos' },
  { value: 'normal', label: 'Normal', hint: '1 MP, 25 pasos' },
  { value: 'hd', label: '2K', hint: 'Nativa 2K, 40 pasos (lenta)' },
]

export function QualitySelect({ value, onChange }: { value: Quality; onChange: (q: Quality) => void }) {
  const current = OPTIONS.find((o) => o.value === value)
  return (
    <div className='flex flex-col gap-1.5'>
      <Label>Calidad</Label>
      <ToggleGroup
        type='single'
        variant='outline'
        value={value}
        onValueChange={(v) => v && onChange(v as Quality)}
        className='w-full'
      >
        {OPTIONS.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value} className='flex-1'>
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <span className='text-xs text-muted-foreground'>{current?.hint}</span>
    </div>
  )
}
