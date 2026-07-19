import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAppSelector } from '@/store/hooks'
import { useLogoutMutation } from '@/store/api'

// Gates the admin area: must be signed in AND have the ADMIN role.
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, status } = useAppSelector((state) => state.auth)
  const [logout] = useLogoutMutation()

  if (status === 'loading') {
    return (
      <div className='flex h-dvh items-center justify-center'>
        <Loader2 className='h-6 w-6 animate-spin text-brand' />
      </div>
    )
  }

  if (status === 'guest') return <Navigate to='/login' replace />

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
