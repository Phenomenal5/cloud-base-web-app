import type { ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
  loading?: boolean
}

export const Button = ({
  variant = 'primary',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) => (
  <button
    // disabled while loading, so a slow request can't be fired off twice
    disabled={disabled || loading}
    className={cn(
      'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60',
      variant === 'primary'
        ? 'bg-brand text-brand-contrast hover:bg-brand-hover'
        : 'border border-border hover:bg-surface-2',
      className,
    )}
    {...props}
  >
    {loading && <Loader2 className='h-4 w-4 animate-spin' />}
    {children}
  </button>
)
