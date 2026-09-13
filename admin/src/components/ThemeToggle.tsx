import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'

// main.tsx sets the class before render, so there's no flash. this is a
// client-only SPA with no SSR, so reading the DOM in the lazy initialiser is
// safe here and saves a setState-in-effect round trip
export const ThemeToggle = () => {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))

  const toggleTheme = () => {
    const nextIsDark = !isDark
    setIsDark(nextIsDark)
    document.documentElement.classList.toggle('dark', nextIsDark)
    try {
      localStorage.setItem('theme', nextIsDark ? 'dark' : 'light')
    } catch {
      // private mode or blocked storage. the toggle still works for this page
    }
  }

  return (
    <button
      type='button'
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className='rounded-lg border border-border p-2 text-muted transition hover:bg-surface-2 hover:text-foreground'
    >
      {isDark ? <Sun className='h-4 w-4' /> : <Moon className='h-4 w-4' />}
    </button>
  )
}
