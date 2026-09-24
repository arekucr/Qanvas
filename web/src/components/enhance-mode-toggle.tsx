import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export function EnhanceModeToggle({ fast, onChange, disabled }: { fast: boolean; onChange: (fast: boolean) => void; disabled?: boolean }) {
  return (
    <ToggleGroup
      type='single'
      variant='outline'
      size='sm'
      value={fast ? 'fast' : 'think'}
      onValueChange={(v) => v && onChange(v === 'fast')}
      disabled={disabled}
      aria-label='Modo del mejorador'
    >
      <ToggleGroupItem value='fast' className='px-2 text-xs' title='Sin razonamiento: responde en segundos'>
        Rápido
      </ToggleGroupItem>
      <ToggleGroupItem value='think' className='px-2 text-xs' title='Razona antes de escribir: más lento (1–3 min)'>
        Detallado
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
