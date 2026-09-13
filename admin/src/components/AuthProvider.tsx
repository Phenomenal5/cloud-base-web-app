import { useEffect, type ReactNode } from 'react'
import { useMeQuery } from '@/store/api'
import { useAppDispatch } from '@/store/hooks'
import { setUser, clearUser } from '@/store/authSlice'

// hits /auth/me once on mount and copies the result into the auth slice. a 401
// here isn't a failure, it just means nobody is signed in
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const dispatch = useAppDispatch()
  const { data, isSuccess, isError } = useMeQuery()

  useEffect(() => {
    if (isSuccess && data) dispatch(setUser(data))
    else if (isError) dispatch(clearUser())
  }, [isSuccess, isError, data, dispatch])

  return <>{children}</>
}
