import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plane } from 'lucide-react'
import { toast } from 'sonner'
import { useLoginMutation, useLogoutMutation } from '@/store/api'
import { getApiErrorMessage } from '@/lib/apiError'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Button } from '@/components/ui/Button'
import { ThemeToggle } from '@/components/ThemeToggle'

export function LoginPage() {
  const navigate = useNavigate()
  const [login, { isLoading }] = useLoginMutation()
  const [logout] = useLogoutMutation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      const user = await login({ email: email.trim().toLowerCase(), password }).unwrap()
      if (user.role !== 'ADMIN') {
        // Not an admin — drop the session we just created.
        await logout().unwrap().catch(() => undefined)
        toast.error('This account is not an administrator.')
        return
      }
      toast.success('Signed in')
      navigate('/')
    } catch (loginError) {
      toast.error(getApiErrorMessage(loginError, 'Invalid email or password.'))
    }
  }

  return (
    <div className='flex h-dvh items-center justify-center px-4'>
      <div className='fixed right-4 top-4'>
        <ThemeToggle />
      </div>
      <div className='w-full max-w-sm'>
        <div className='mb-8 flex items-center justify-center gap-2 text-lg font-semibold'>
          <span className='flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand'>
            <Plane className='h-4 w-4' />
          </span>
          AeroLens Admin
        </div>
        <div className='rounded-2xl border border-border bg-surface p-6 shadow-sm'>
          <h1 className='text-xl font-semibold'>Sign in</h1>
          <p className='mt-1 text-sm text-muted'>Administrator access only.</p>
          <form onSubmit={handleSubmit} className='mt-4 flex flex-col gap-4'>
            <Input
              label='Email'
              name='email'
              type='email'
              autoComplete='email'
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <PasswordInput
              label='Password'
              name='password'
              autoComplete='current-password'
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Button type='submit' loading={isLoading}>
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
