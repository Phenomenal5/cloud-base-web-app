import { useEffect, type ReactNode } from 'react'
import { useMeQuery } from '@/store/api'
import { useAppDispatch } from '@/store/hooks'
import { setUser, clearUser } from '@/store/authSlice'

// Runs /auth/me once on mount and mirrors the result into the auth slice. A 401
// here just means nobody is signed in, so it resolves to guest.
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const dispatch = useAppDispatch()
  const { data, isSuccess, isError } = useMeQuery()

  useEffect(() => {
    if (isSuccess && data) dispatch(setUser(data))
    else if (isError) dispatch(clearUser())
  }, [isSuccess, isError, data, dispatch])

  return <>{children}</>
}
