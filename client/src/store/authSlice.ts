import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { User } from "@/lib/types";

// ─── Auth slice ───────────────────────────────────────
// Mirrors the current user for easy access across the app. Synced from the
// /auth/me query by AuthProvider; cleared on 401 by the api baseQuery.
// NOTE: imports no api module — keeps the api → clearUser dependency one-way.

interface AuthState {
  user: User | null;
  status: "loading" | "authenticated" | "guest";
}

const initialState: AuthState = { user: null, status: "loading" };

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<User>) {
      state.user = action.payload;
      state.status = "authenticated";
    },
    clearUser(state) {
      state.user = null;
      state.status = "guest";
    },
  },
});

export const { setUser, clearUser } = authSlice.actions;
export default authSlice.reducer;
