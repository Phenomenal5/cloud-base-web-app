import { configureStore } from "@reduxjs/toolkit";
import { api } from "./api";
import authReducer from "./authSlice";

// A factory rather than a module-level store, so each client gets a fresh one.
// Server state lives in the RTK Query cache; local state goes in plain slices.
export const makeStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
      [api.reducerPath]: api.reducer,
    },
    middleware: (getDefault) =>
      getDefault({
        // These dev checks deep-walk the whole state on every action. The RTK
        // Query cache is immutable and serializable by construction, so skipping
        // it keeps dev fast on a large cache. Our own slices are still checked.
        immutableCheck: { ignoredPaths: [api.reducerPath] },
        serializableCheck: { ignoredPaths: [api.reducerPath] },
      }).concat(api.middleware),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
