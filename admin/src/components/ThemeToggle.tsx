import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'

// Toggles the `.dark` class on <html> and persists the choice. The initial class
// is set in main.tsx before render, so there's no flash.
export function ThemeToggle() {
  // Lazy init from the class main.tsx set before render — SPA (no SSR), so
  // reading the DOM here is safe and avoids a setState-in-effect cascade.
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))

  function toggleTheme() {
    const nextIsDark = !isDark
    setIsDark(nextIsDark)
    document.documentElement.classList.toggle('dark', nextIsDark)
    try {
      localStorage.setItem('theme', nextIsDark ? 'dark' : 'light')
    } catch {
      // ignore storage failures
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
