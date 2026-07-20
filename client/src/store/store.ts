import { configureStore } from "@reduxjs/toolkit";
import { api } from "./api";
import authReducer from "./authSlice";

// ─── Store factory ────────────────────────────────────
// A fresh store per client (created once in StoreProvider). Server state lives in
// the RTK Query cache; local state (auth mirror) in plain slices.

export const makeStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
      [api.reducerPath]: api.reducer,
    },
    middleware: (getDefault) =>
      getDefault({
        // Dev-only checks deep-walk the whole state on every action. Skip RTK
        // Query's cache (immutable + serializable by construction) so a large
        // cache doesn't slow dev; our own slices are still checked.
        immutableCheck: { ignoredPaths: [api.reducerPath] },
        serializableCheck: { ignoredPaths: [api.reducerPath] },
      }).concat(api.middleware),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
