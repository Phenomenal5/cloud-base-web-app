# Nasight — admin dashboard

A small React + Vite SPA for running the system: watching usage, managing accounts, loading new reports into the corpus, and sending announcements. It's a separate app from `client/` on purpose — admin tooling has a different audience, a different risk profile, and no reason to ship in the bundle every visitor downloads.

Everything here is **ADMIN-only**. The API enforces that with a single `protect → authorize("ADMIN")` guard across the whole `/api/admin` router, so a non-admin signing in gets nothing regardless of what the UI does.

---

## Getting it running

The API has to be up first.

```bash
npm install
cp .env.example .env
npm run dev
```

Runs on [http://localhost:3001](http://localhost:3001) — the port is pinned in `vite.config.ts` rather than left to Vite's default, because the API's CORS allowlist expects it there.

One environment variable:

```
VITE_API_URL=http://localhost:8000/api
```

Keep the `/api` on the end; all request paths are written relative to it.

You'll need an account with the `ADMIN` role to get past the login screen. If you haven't made one yet, the quickest route is `npm run prisma:studio` in `server/` and flipping a user's role by hand.

---

## The four screens

**Dashboard** — the overview: total users, reports in the corpus, queries run, and tokens consumed. The token figure is the one to watch; it's what your OpenAI bill is made of.

**Users** — every account, filterable by role and status. You can promote or demote between `TRAINEE`, `ANALYST` and `ADMIN`, and block or unblock people. Role changes take effect on the user's next request.

**Ingestion** — upload an ASRS CSV to add reports to the corpus. The upload returns straight away and the job list below polls every 4 seconds so you can watch it move `QUEUED → PROCESSING → COMPLETED`, with row and chunk counts as it goes. A failure surfaces the error message on the job row.

**Broadcasts** — send an in-app notification to every user at once. It writes one notification row per user; they see it in the bell in the main app. It does not send email.

---

## Layout

```
src/
├── main.tsx  App.tsx
├── routes/router.tsx      # createBrowserRouter, everything behind ProtectedRoute
├── pages/                 # Dashboard, Users, Ingestion, Broadcasts, Login
├── components/
│   ├── Layout.tsx         # shell + nav
│   ├── ProtectedRoute.tsx  AuthProvider.tsx
│   └── ui/                # Button, Input, Alert, PasswordInput
├── store/                 # RTK store, api slice, auth slice, axios base query
└── lib/                   # axios, config, cn, types, apiError
```

Style conventions here differ from `client/` — **no semicolons, single quotes**, `@` aliased to `src`. Match the file you're editing.

Auth works the same way as the user app: httpOnly cookies, `withCredentials`, and a single-flight refresh on 401 so concurrent requests don't race each other into a logout.

---

## Scripts

| Command | |
|---|---|
| `npm run dev` | Dev server on :3001 |
| `npm run build` | `tsc -b` then a production Vite build |
| `npm run preview` | Serve the built output locally |
| `npm run check` | typecheck + lint + prettier — run before committing |
| `npm run lint:fix` / `npm run format` | Fix things automatically |

---

## Things that will trip you up

**A CSV upload does nothing if the worker isn't running.** The API only enqueues the job; `server`'s worker process is what actually parses, chunks, embeds and stores. Without it the job sits at `QUEUED` forever and the page looks stuck. Start it with `npm run worker` in `server/`.

**Ingestion costs real money.** Every row means an embedding call and a classification call. `INGESTION_MAX_ROWS` (default 5000) caps a single upload so one careless file can't run up a bill.

**Blocking yourself is possible.** Nothing stops you from setting your own account to `BLOCKED` or demoting your only admin. Prisma Studio is the way back if you do.

**Metrics are retention-bounded.** The nightly rollup prunes raw query and token logs older than `METRICS_RETENTION_DAYS` (default 90) so the dashboard's aggregates stay fast. Daily rollups survive; the raw rows behind them don't.
