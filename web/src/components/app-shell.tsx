import { useEffect, useState, type ReactNode } from 'react'
import {
  HistoryIcon, ImageIcon, MoonIcon, PencilRulerIcon, SmileIcon, SparklesIcon, SunIcon, UsersIcon, type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from '@/components/ui/sidebar'
import { APP_NAME, Mascot, Wordmark } from '@/components/brand'
import { useTheme } from '@/hooks/use-theme'
import { getHealth, type Health } from '@/lib/api'
import { cn } from '@/lib/utils'

export type Route = 'generate' | 'editor' | 'stickers' | 'meme' | 'group' | 'history'

interface NavItem { route: Route; label: string; icon: LucideIcon }

const CREATE: NavItem[] = [
  { route: 'generate', label: 'Generar', icon: SparklesIcon },
  { route: 'editor', label: 'Editor IA', icon: PencilRulerIcon },
  { route: 'stickers', label: 'Stickers', icon: SmileIcon },
]
const PEOPLE: NavItem[] = [
  { route: 'meme', label: 'Meme con cara', icon: ImageIcon },
  { route: 'group', label: 'Foto grupal', icon: UsersIcon },
]
const ALL = [...CREATE, ...PEOPLE, { route: 'history' as Route, label: 'Historial', icon: HistoryIcon }]

// Active item: the reference's blue gradient pill (same `data-active` variant the sidebar uses, so it overrides it).
const NAV_ITEM =
  'h-10 gap-3 rounded-xl px-3 text-[15px] [&_svg]:size-[18px] data-active:bg-[image:var(--brand-gradient)] data-active:font-semibold data-active:text-white data-active:shadow-[var(--brand-glow)] data-active:hover:text-white'

function NavGroup({ label, items, route }: { label?: string; items: NavItem[]; route: Route }) {
  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu className='gap-1'>
          {items.map((item) => (
            <SidebarMenuItem key={item.route}>
              <SidebarMenuButton asChild isActive={route === item.route} className={NAV_ITEM}>
                <a href={`#/${item.route}`}>
                  <item.icon />
                  <span>{item.label}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

type Tone = 'success' | 'warning' | 'destructive'
interface Status { tone: Tone; text: string; detail: string; pulse?: boolean }

function useStatus(): Status | null {
  const [health, setHealth] = useState<Health | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const check = () =>
      getHealth()
        .then((h) => { setHealth(h); setFailed(false) })
        .catch(() => setFailed(true))
    check()
    const t = setInterval(check, 5000)
    return () => clearInterval(t)
  }, [])

  if (failed) return { tone: 'destructive', text: 'Servidor sin conexión', detail: 'Revisa que Docker esté corriendo' }
  if (!health) return null
  if (!health.comfy) return { tone: 'destructive', text: 'ComfyUI sin conexión', detail: 'El generador no responde' }
  if (!health.warm.comfy) return { tone: 'warning', text: 'Preparando modelos…', detail: 'Cargando Qwen-Image 2.1', pulse: true }
  if (!health.llm) return { tone: 'warning', text: 'GPU lista', detail: 'Mejorador de prompts sin conexión' }
  return { tone: 'success', text: 'GPU lista', detail: 'Qwen-Image 2.1 · mejorador listo' }
}

const TONE_PILL: Record<Tone, string> = {
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
}
const TONE_DOT: Record<Tone, string> = { success: 'bg-success', warning: 'bg-warning', destructive: 'bg-destructive' }

function StatusPill({ status }: { status: Status | null }) {
  if (!status) return null
  return (
    <span role='status' className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold', TONE_PILL[status.tone])}>
      <span className={cn('size-2 rounded-full', TONE_DOT[status.tone], status.pulse && 'animate-pulse')} aria-hidden />
      {status.text}
    </span>
  )
}

function StatusCard({ status }: { status: Status | null }) {
  return (
    <div className='flex items-center gap-3 rounded-2xl border border-sidebar-border bg-card p-3 shadow-card'>
      <span className='flex size-10 shrink-0 items-center justify-center rounded-full bg-accent'>
        <Mascot size={32} />
      </span>
      <div className='flex min-w-0 flex-col'>
        <span className='text-sm font-semibold'>{APP_NAME} AI</span>
        {status && (
          <span className='flex items-center gap-1.5 truncate text-xs text-muted-foreground'>
            <span className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[status.tone], status.pulse && 'animate-pulse')} aria-hidden />
            {status.detail}
          </span>
        )}
      </div>
    </div>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const dark = theme === 'dark'
  return (
    <Button
      variant='outline'
      size='icon-lg'
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      className='rounded-xl border-amber-300/60 bg-amber-50 text-amber-500 hover:bg-amber-100 hover:text-amber-600 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300 dark:hover:bg-amber-400/20'
    >
      {dark ? <MoonIcon /> : <SunIcon />}
    </Button>
  )
}

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const current = ALL.find((i) => i.route === route)
  const status = useStatus()
  return (
    <div className='flex min-h-dvh w-full'>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader className='px-3 pt-4 pb-2'>
            <a href='#/generate' className='flex items-center justify-between gap-2 px-1' aria-label={`${APP_NAME}: inicio`}>
              <Wordmark height={40} />
              <span className='relative flex size-11 shrink-0 items-center justify-center rounded-full bg-card shadow-card ring-1 ring-sidebar-border'>
                <Mascot size={36} />
                <span className={cn('absolute top-0.5 right-0.5 size-2.5 rounded-full ring-2 ring-sidebar', TONE_DOT[status?.tone ?? 'warning'])} aria-hidden />
              </span>
            </a>
          </SidebarHeader>
          <SidebarContent className='px-1'>
            <NavGroup label='Crear' items={CREATE} route={route} />
            <NavGroup label='Con personas' items={PEOPLE} route={route} />
            <NavGroup items={[ALL[ALL.length - 1]]} route={route} />
          </SidebarContent>
          <SidebarFooter className='p-3'>
            <StatusCard status={status} />
          </SidebarFooter>
        </Sidebar>
        <div className='flex min-w-0 flex-1 flex-col'>
          <header className='sticky top-0 z-50 border-b bg-card/85 backdrop-blur'>
            <div className='flex items-center justify-between gap-6 px-4 py-2.5 sm:px-6'>
              <div className='flex items-center gap-4'>
                <SidebarTrigger className='[&_svg]:size-5!' />
                <Separator orientation='vertical' className='hidden h-4! data-vertical:self-center sm:block' />
                <Breadcrumb className='hidden sm:block'>
                  <BreadcrumbList className='text-[15px]'>
                    <BreadcrumbItem>{APP_NAME}</BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage className='font-semibold'>{current?.label}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
              <div className='flex items-center gap-2'>
                <StatusPill status={status} />
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main className='flex-1 px-4 py-6 sm:px-6'>{children}</main>
          <footer className='px-4 pb-4 sm:px-6'>
            <div className='flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-xs text-muted-foreground shadow-card'>
              <span className='size-1.5 shrink-0 rounded-full bg-primary' aria-hidden />
              Qwen-Image-2.1 está bajo la Qwen Research License: revisa sus límites antes de cualquier uso comercial.
            </div>
          </footer>
        </div>
      </SidebarProvider>
    </div>
  )
}
