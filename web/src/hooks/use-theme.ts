import { useCallback, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
const KEY = 'qwen-studio-theme'
const EVENT = 'qwen-studio-theme-change'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

const resolve = (): Theme => stored() ?? (media().matches ? 'dark' : 'light')

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(resolve)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    const mq = media()
    const onChange = () => { if (!stored()) setThemeState(mq.matches ? 'dark' : 'light') }
    const onSet = () => setThemeState(resolve())
    mq.addEventListener('change', onChange)
    window.addEventListener(EVENT, onSet)
    return () => { mq.removeEventListener('change', onChange); window.removeEventListener(EVENT, onSet) }
  }, [])

  const setTheme = useCallback((t: Theme) => {
    try { localStorage.setItem(KEY, t) } catch { /* private mode */ }
    setThemeState(t)
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return { theme, setTheme }
}
