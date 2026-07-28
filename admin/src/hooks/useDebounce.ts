import { useEffect, useState } from 'react'

// Returns a copy of the value that only updates after `delay` ms of quiet, so a
// search request doesn't fire on every keystroke.
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
