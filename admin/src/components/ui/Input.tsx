import type { InputHTMLAttributes, Ref } from 'react'
import { cn } from '@/lib/cn'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  ref?: Ref<HTMLInputElement>
}

// NOTE: no forwardRef. On React 19 `ref` is an ordinary prop for function
// components, and forwardRef is deprecated.
export const Input = ({ label, error, id, className, ref, ...props }: InputProps) => {
  // Fall back to the field name so the label still points at the right input.
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
}
