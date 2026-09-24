import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

export function ConsentCheck({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className='flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/5 p-3'>
      <Checkbox id='consent' checked={checked} onCheckedChange={(v) => onChange(v === true)} className='mt-0.5' />
      <Label htmlFor='consent' className='flex flex-col items-start gap-1 font-normal leading-snug'>
        <span className='font-medium'>Tengo permiso de las personas que aparecen</span>
        <span className='text-xs text-muted-foreground'>
          Las fotos de rostros son datos personales. No se permite contenido sexual, humillante ni con menores.
        </span>
      </Label>
    </div>
  )
}
