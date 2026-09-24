import { useCallback, useEffect, useState } from 'react'

const KEY = 'qwen-studio-enhance-fast'
const EVENT = 'qwen-studio-enhance-mode-change'

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'false'
  } catch {
    return true
  }
}

// Fast (no reasoning) is the default; the choice is remembered per browser and shared by all pages.
export function useEnhanceMode() {
  const [fast, setFastState] = useState(read)

  useEffect(() => {
    const sync = () => setFastState(read())
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])

  const setFast = useCallback((v: boolean) => {
    try { localStorage.setItem(KEY, String(v)) } catch { /* private mode */ }
    setFastState(v)
    window.dispatchEvent(new Event(EVENT))
  }, [])

  return { fast, setFast }
}
