"use client";

import { useEffect, type ReactNode } from "react";
import { useMeQuery } from "./api";
import { useAppDispatch } from "./hooks";
import { setUser, clearUser } from "./authSlice";

// Runs /auth/me once on mount and mirrors the result into the auth slice. A 401
// here just means guest, so it resolves to the guest state rather than erroring.
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const dispatch = useAppDispatch();
  const { data, isSuccess, isError } = useMeQuery();

  useEffect(() => {
    if (isSuccess && data) dispatch(setUser(data));
    else if (isError) dispatch(clearUser());
  }, [isSuccess, isError, data, dispatch]);

  return <>{children}</>;
};
