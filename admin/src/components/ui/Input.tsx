import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className, ...props },
  ref,
) {
  const inputId = id ?? props.name
  return (
    <div className='flex flex-col gap-1.5'>
      {label && (
        <label htmlFor={inputId} className='text-sm font-medium'>
          {label}
        </label>
      )}
      <input
        id={inputId}
        ref={ref}
        aria-invalid={Boolean(error)}
        className={cn(
          'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition placeholder:text-muted focus:border-brand',
          error && 'border-rose-400',
          className,
        )}
        {...props}
      />
      {error && <p className='text-xs text-rose-600 dark:text-rose-400'>{error}</p>}
    </div>
  )
})
