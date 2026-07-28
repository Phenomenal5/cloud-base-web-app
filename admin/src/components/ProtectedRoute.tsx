import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAppSelector } from '@/store/hooks'
import { useLogoutMutation } from '@/store/api'

// Gates the admin area on being signed in and holding the ADMIN role. This is
// UX, not access control: every /api/admin route checks the role server-side.
export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, status } = useAppSelector((state) => state.auth)
  const [logout] = useLogoutMutation()

  // Wait for /auth/me before deciding, or a refresh would bounce a signed-in
  // admin to the login page.
  if (status === 'loading') {
    return (
      <div className='flex h-dvh items-center justify-center'>
        <Loader2 className='h-6 w-6 animate-spin text-brand' />
      </div>
    )
  }

  if (status === 'guest') return <Navigate to='/login' replace />

  // Signed in but not an admin. Explain it and offer a way out, rather than
  // redirecting them into a loop with the login page.
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
