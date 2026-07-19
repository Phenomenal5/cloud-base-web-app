import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'

// Keeps sonner's palette in sync with the `.dark` class ThemeToggle flips on <html>.
export function AppToaster() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const root = document.documentElement
    const syncTheme = () => setTheme(root.classList.contains('dark') ? 'dark' : 'light')
    syncTheme()
    const observer = new MutationObserver(syncTheme)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return <Toaster theme={theme} position='top-center' richColors closeButton />
}
