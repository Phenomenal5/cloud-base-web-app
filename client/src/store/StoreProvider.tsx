"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Provider } from "react-redux";
import { setupListeners } from "@reduxjs/toolkit/query";
import { makeStore } from "./store";

// the lazy useState initialiser runs makeStore exactly once per client, and
// without poking a ref during render. setupListeners is what turns on RTK
// Query's refetch-on-focus and refetch-on-reconnect
export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const [store] = useState(makeStore);

  useEffect(() => setupListeners(store.dispatch), [store]);

  return <Provider store={store}>{children}</Provider>;
};
