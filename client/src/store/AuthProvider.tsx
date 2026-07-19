"use client";

import { useEffect, type ReactNode } from "react";
import { useMeQuery } from "./api";
import { useAppDispatch } from "./hooks";
import { setUser, clearUser } from "./authSlice";

// ─── AuthProvider ─────────────────────────────────────
// Runs /auth/me once on mount and mirrors the result into the auth slice, so any
// component can read the current user without repeating the query. A 401 (guest
// or expired-then-unrefreshable) resolves to the "guest" state.

export function AuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const { data, isSuccess, isError } = useMeQuery();

  useEffect(() => {
    if (isSuccess && data) dispatch(setUser(data));
    else if (isError) dispatch(clearUser());
  }, [isSuccess, isError, data, dispatch]);

  return <>{children}</>;
}
