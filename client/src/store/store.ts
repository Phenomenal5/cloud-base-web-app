import { configureStore } from "@reduxjs/toolkit";
import { api } from "./api";
import authReducer from "./authSlice";

// a factory, not a store sitting at module level, so every client gets its own.
// server data lives in the RTK Query cache, local UI state goes in plain slices
export const makeStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
      [api.reducerPath]: api.reducer,
    },
    middleware: (getDefault) =>
      getDefault({
        // these dev checks walk the entire state on every single action. the RTK
        // Query cache is already immutable and serialisable by construction, so
        // skipping it keeps dev usable once the cache is big. our own slices are
        // still checked
        immutableCheck: { ignoredPaths: [api.reducerPath] },
        serializableCheck: { ignoredPaths: [api.reducerPath] },
      }).concat(api.middleware),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
