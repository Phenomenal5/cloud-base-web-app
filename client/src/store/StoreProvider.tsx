"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Provider } from "react-redux";
import { setupListeners } from "@reduxjs/toolkit/query";
import { makeStore } from "./store";

// ─── StoreProvider ────────────────────────────────────
// Creates the store once per client and enables RTK Query's refetch-on-focus /
// refetch-on-reconnect behaviour. useState's lazy initializer runs makeStore
// exactly once (not module scope, so a fresh store per client) without touching
// a ref during render.

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(makeStore);

  useEffect(() => setupListeners(store.dispatch), [store]);

  return <Provider store={store}>{children}</Provider>;
}
