import { useState, type InputHTMLAttributes, type Ref } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/cn'

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  ref?: Ref<HTMLInputElement>
}

export const PasswordInput = ({
  label,
  error,
  id,
  className,
  ref,
  ...props
}: PasswordInputProps) => {
  const [isVisible, setIsVisible] = useState(false)
  const inputId = id ?? props.name

  return (
    <div className='flex flex-col gap-1.5'>
      {label && (
        <label htmlFor={inputId} className='text-sm font-medium'>
          {label}
        </label>
      )}
      <div className='relative'>
        <input
          id={inputId}
          ref={ref}
          type={isVisible ? 'text' : 'password'}
          aria-invalid={Boolean(error)}
          className={cn(
            'w-full rounded-lg border border-border bg-surface px-3 py-2 pr-10 text-sm outline-none transition placeholder:text-muted focus:border-brand',
            error && 'border-rose-400',
            className,
          )}
          {...props}
        />
        <button
          type='button'
          // Skipped in the tab order, so tabbing goes password to submit.
          tabIndex={-1}
          onClick={() => setIsVisible((visible) => !visible)}
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          className='absolute inset-y-0 right-0 flex items-center px-3 text-muted transition hover:text-foreground'
        >
          {isVisible ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
        </button>
      </div>
      {error && <p className='text-xs text-rose-600 dark:text-rose-400'>{error}</p>}
    </div>
  )
}
