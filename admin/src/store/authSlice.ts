import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { User } from '@/lib/types'

// Mirrors the current user. Filled in from /auth/me by AuthProvider, cleared on
// a 401 by the api baseQuery.

interface AuthState {
  user: User | null
  status: 'loading' | 'authenticated' | 'guest'
}

const initialState: AuthState = { user: null, status: 'loading' }

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<User>) {
      state.user = action.payload
      state.status = 'authenticated'
    },
    clearUser(state) {
      state.user = null
      state.status = 'guest'
    },
  },
})

export const { setUser, clearUser } = authSlice.actions
export default authSlice.reducer
