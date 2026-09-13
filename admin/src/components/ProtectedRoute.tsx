import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAppSelector } from '@/store/hooks'
import { useLogoutMutation } from '@/store/api'

// gates the admin area on being signed in and actually being an ADMIN. this is
// UX, not security. every /api/admin route checks the role server side
export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, status } = useAppSelector((state) => state.auth)
  const [logout] = useLogoutMutation()

  // wait for /auth/me before deciding anything, or a refresh throws a signed-in
  // admin back to the login page
  if (status === 'loading') {
    return (
      <div className='flex h-dvh items-center justify-center'>
        <Loader2 className='h-6 w-6 animate-spin text-brand' />
      </div>
    )
  }

  if (status === 'guest') return <Navigate to='/login' replace />

  // signed in but not an admin. say so and give them a way out, rather than
  // bouncing them into a loop with the login page
  if (user && user.role !== 'ADMIN') {
    return (
      <div className='flex h-dvh flex-col items-center justify-center gap-3 text-center'>
        <p className='text-sm text-muted'>This area is for administrators only.</p>
        <button
          type='button'
          onClick={() => logout()}
          className='text-sm text-brand hover:underline'
        >
          Sign out
        </button>
      </div>
    )
  }

  return <>{children}</>
}
