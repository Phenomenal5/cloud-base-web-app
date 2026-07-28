"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Provider } from "react-redux";
import { setupListeners } from "@reduxjs/toolkit/query";
import { makeStore } from "./store";

// useState's lazy initializer runs makeStore exactly once per client, without
// touching a ref during render. setupListeners is what enables RTK Query's
// refetch on focus and on reconnect.
export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const [store] = useState(makeStore);

  useEffect(() => setupListeners(store.dispatch), [store]);

  return <Provider store={store}>{children}</Provider>;
};
