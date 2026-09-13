import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { User } from "@/lib/types";

// mirrors the current user so any component can read it without running the
// query again. AuthProvider fills it, the api baseQuery clears it on a 401.
//
// this file imports nothing from the api module on purpose, which keeps the
// api -> clearUser dependency going one way and avoids a cycle

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
