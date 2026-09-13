"use client";

import { useEffect, type ReactNode } from "react";
import { useMeQuery } from "./api";
import { useAppDispatch } from "./hooks";
import { setUser, clearUser } from "./authSlice";

// hits /auth/me once on mount and copies the result into the auth slice. a 401
// here isn't a failure, it just means they're a guest
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const dispatch = useAppDispatch();
  const { data, isSuccess, isError } = useMeQuery();

  useEffect(() => {
    if (isSuccess && data) dispatch(setUser(data));
    else if (isError) dispatch(clearUser());
  }, [isSuccess, isError, data, dispatch]);

  return <>{children}</>;
};
