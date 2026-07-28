import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plane } from 'lucide-react'
import { toast } from 'sonner'
import { useLoginMutation, useLogoutMutation } from '@/store/api'
import { useAppSelector } from '@/store/hooks'
import { getApiErrorMessage } from '@/lib/apiError'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Button } from '@/components/ui/Button'
import { ThemeToggle } from '@/components/ThemeToggle'

export const LoginPage = () => {
  const navigate = useNavigate()
  const [login, { isLoading }] = useLoginMutation()
  const [logout] = useLogoutMutation()
  const { user, status } = useAppSelector((state) => state.auth)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // NOTE: navigate only once auth state has committed to an admin user. Calling
  // navigate('/') straight after login().unwrap() raced the mutation's setUser
  // dispatch: status was still 'guest', so ProtectedRoute bounced straight back
  // here and never re-routed, which is why sign-in sometimes needed a reload.
  // Reacting to committed status can't race. This also bounces an already
  // signed-in admin who lands back on /login.
  useEffect(() => {
    if (status === 'authenticated' && user?.role === 'ADMIN') navigate('/', { replace: true })
  }, [status, user, navigate])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      const signedIn = await login({ email: email.trim().toLowerCase(), password }).unwrap()

      // Credentials were valid but this isn't an admin, so drop the session we
      // just created rather than leaving them signed in with nowhere to go.
      if (signedIn.role !== 'ADMIN') {
        await logout()
          .unwrap()
          .catch(() => undefined)
        toast.error('This account is not an administrator.')
        return
      }

      toast.success('Signed in')
      // The effect above handles navigation once setUser commits.
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Invalid email or password.'))
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
          Nasight Admin
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
