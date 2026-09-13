import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface AlertProps {
  variant?: 'error' | 'success'
  children: ReactNode
}

export const Alert = ({ variant = 'error', children }: AlertProps) => (
  <div
    // role="alert" cuts a screen reader off mid-sentence. right for an error, rude
    // for a success message, so those announce politely instead
    role={variant === 'error' ? 'alert' : 'status'}
    className={cn(
      'rounded-lg px-3 py-2 text-sm',
      variant === 'error'
        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    )}
  >
    {children}
  </div>
)
