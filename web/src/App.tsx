import { useCallback, useEffect, useState } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell, type Route } from '@/components/app-shell'
import { EditorPage } from '@/pages/editor'
import { GeneratePage } from '@/pages/generate'
import { GroupPage } from '@/pages/group'
import { HistoryPage } from '@/pages/history'
import { MemePage } from '@/pages/meme'
import { StickersPage } from '@/pages/stickers'

const ROUTES: Route[] = ['generate', 'editor', 'stickers', 'meme', 'group', 'history']

function readRoute(): Route {
  const r = window.location.hash.replace(/^#\/?/, '') as Route
  return ROUTES.includes(r) ? r : 'generate'
}

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute)
  const [editorSeed, setEditorSeed] = useState<string | null>(null)

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const openInEditor = useCallback((url: string) => {
    setEditorSeed(url)
    window.location.hash = '#/editor'
  }, [])
  const seedConsumed = useCallback(() => setEditorSeed(null), [])

  return (
    <TooltipProvider>
      <AppShell route={route}>
        {route === 'generate' && <GeneratePage onEdit={openInEditor} />}
        {route === 'stickers' && <StickersPage onEdit={openInEditor} />}
        {route === 'meme' && <MemePage onEdit={openInEditor} />}
        {route === 'group' && <GroupPage onEdit={openInEditor} />}
        {route === 'history' && <HistoryPage onEdit={openInEditor} />}
        {/* Kept mounted so edit history survives navigating away. */}
        <div hidden={route !== 'editor'}>
          <EditorPage seedUrl={editorSeed} onSeedConsumed={seedConsumed} />
        </div>
      </AppShell>
      <Toaster richColors position='bottom-right' />
    </TooltipProvider>
  )
}
