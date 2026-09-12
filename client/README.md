# Nasight, user app

The web app people actually use. Next.js 16 (App Router) with the chat interface, the report browser, and all the account screens. It holds no business logic of its own, everything comes from the API in `server/`.

---

## Getting it running

The API needs to be up first, or every page will just show errors.

```bash
npm install
cp .env.example .env.local
npm run dev
```

That's it, [http://localhost:3000](http://localhost:3000).

There's exactly one environment variable:

```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

**Include the `/api` suffix.** Every request path in the app is written relative to it (`/auth/login`, `/conversations`), so dropping it produces a wall of confusing 404s. And because it's `NEXT_PUBLIC_`, it gets inlined into the browser bundle at build time, changing it means rebuilding, not just restarting.

---

## What's in it

| Route | |
|---|---|
| `/` | Landing page |
| `/chat` and `/chat/:id` | The main event, streaming grounded Q&A |
| `/reports` | Browsable incident list, filterable by category, severity and date. Analysts and admins only. |
| `/profile` | Display name and avatar |
| `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/oauth-callback` | Everything account-related, grouped under the `(auth)` route group |

Guests can use the chat without signing up, they get 2 questions a day and their conversation isn't saved anywhere. That's what `GuestBanner` is telling them.

---

## How the pieces work

**Auth is invisible to the JavaScript.** The API sets httpOnly cookies, so there's no token in `localStorage` and nothing for a client-side script to steal. Axios just sends `withCredentials: true` and the browser handles the rest.

The interesting part is in `store/api.ts`: when any request comes back 401, the base query transparently calls `/auth/refresh` and retries the original request. Concurrent 401s share a **single** refresh promise, refresh tokens rotate on use, so two parallel refreshes would invalidate each other and log the user out for no reason. If the refresh itself fails, the user is cleared and bounced to login.

**Chat streams over SSE.** `lib/chatStream.ts` opens an `EventSource` against `GET /ask` and dispatches named events, `meta` (conversation id, rewritten query, remaining quota), `token` (append to the answer), `sources` (the retrieved reports), `done`. This is why the answer paints word by word instead of appearing all at once. `EventSource` is used rather than axios because it's the browser's native SSE client and handles the framing for you.

**Server data lives in RTK Query, UI state in plain slices.** Anything that comes from the API is a query with cache tags; anything local (auth status, open menus) is regular Redux. The `Conversation`/`Notification`/`Report` tag types mean a single mutation refetches only what it actually invalidated.

**Notifications poll every 60 seconds** and pause when the tab is unfocused. Admin broadcasts are written straight to the database with no socket or push channel behind them, so polling is the only way one reaches a tab that's already open.

**Theming** is CSS variables plus a `dark` class on `<html>`, persisted to `localStorage`. Components reference tokens like `bg-surface` and `text-muted` rather than hardcoded colours, so both themes stay consistent for free.

---

## Layout

```
src/
├── app/
│   ├── (auth)/            # login, register, verification, password reset
│   ├── chat/[[...id]]/    # optional catch-all: /chat and /chat/<id> are one page
│   ├── reports/  profile/
│   └── layout.tsx  page.tsx  globals.css
├── components/
│   ├── chat/              # ChatThread, ChatComposer, ConversationSidebar, Markdown
│   ├── layout/            # AppHeader, NotificationBell
│   └── reports/  ui/  auth/
├── store/                 # RTK store, the api slice, auth slice, axios base query
└── hooks/  lib/           # useDebounce, chatStream, axios, validators, utils
```

Style conventions here: semicolons, double quotes, and `@/` aliased to `src/`. Match whatever file you're in.

---

## Scripts

| Command | |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run check` | typecheck + lint + prettier, run before committing |
| `npm run lint:fix` / `npm run format` | Fix things automatically |

---

## Things that will trip you up

**Cookies won't stick if CORS isn't right.** The API has an explicit origin allowlist, so `http://localhost:3000` has to be in the server's `CORS_ORIGINS`. A wildcard doesn't work here, browsers refuse credentialed requests against `*`, so you'll be silently logged out on every request.

**`/reports` is role-gated.** A `TRAINEE` account gets a 403 from the API. Promote yourself to `ANALYST` or `ADMIN` in the admin dashboard (or straight in Prisma Studio) to see it.

**Verification codes go to your console in dev.** If SMTP isn't configured on the server, the code is logged there rather than emailed. Look in the API terminal, not your inbox.

**This is Next.js 16.** It differs from older App Router material in real ways, check `node_modules/next/dist/docs/` before reaching for a pattern you remember from an older version.
