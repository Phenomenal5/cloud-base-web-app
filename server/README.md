# Nasight API

This is the backend — an Express 5 + TypeScript service that owns everything: authentication, the vector search, the grounded Q&A stream, and the background ingestion queue. Both frontends (`client/` and `admin/`) are thin by comparison; if you're looking for where the actual work happens, it's here.

It runs as **two processes** off the same codebase:

- **the API** (`src/server.ts`) — handles HTTP requests
- **the worker** (`src/worker.ts`) — chews through CSV ingestion jobs and the nightly metrics rollup

They're split because embedding a few thousand report chunks takes minutes, and you don't want that happening inside a request. In production they deploy as two separate services pointed at the same database.

---

## Getting it running

You'll need Node 20+ and a PostgreSQL 15+ database with the `pgvector` extension. Neon works well and is what this was built against — the free tier is fine.

```bash
npm install
cp .env.example .env      # then fill it in, see below
npm run prisma:generate
npm run prisma:migrate
npm run seed              # optional: loads the sample ASRS reports
```

Then, in two terminals:

```bash
npm run dev       # API on http://localhost:8000
npm run worker    # background worker
```

If the API booted, `http://localhost:8000/api/health` returns `{"status":"ok","db":"up"}`. That endpoint runs a real `SELECT 1`, so a 200 means the connection pool genuinely reached Postgres — it's not just a liveness ping.

There's interactive API documentation at **`http://localhost:8000/api/docs`** (Swagger UI, generated from JSDoc comments on the routes). It's disabled in production on purpose — no need to hand the whole API surface to the internet.

### The minimum you must configure

Only two variables are genuinely required. The server calls `process.exit(1)` at boot if either is missing, rather than limping along and throwing a 500 on the first request that needs them:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Standard `postgresql://` URL. Prisma 7 reads it via the pg driver adapter, not from the schema. |
| `JWT_ACCESS_SECRET` | Must be **at least 32 characters**. Generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |

Everything else has a sensible default. A few worth knowing about:

| Variable | Default | What happens |
|---|---|---|
| `PORT` | `8000` | Matches what both frontends default to (`http://localhost:8000/api`). Change it and you have to change theirs too. |
| `OPENAI_API_KEY` | *(empty)* | Without it, embeddings fall back to a deterministic dev stub. The pipeline runs end to end, but search results aren't actually semantic. |
| `BREVO_API_KEY` | *(empty)* | Without it, verification and reset codes are printed to the console instead of emailed. Genuinely convenient in dev. |
| `QUEUE_DATABASE_URL` | falls back to `DATABASE_URL` | See the pg-boss note below — this one bites. |
| `CORS_ORIGINS` | `localhost:3000,localhost:3001` | Explicit allowlist, never a wildcard. Add your deployed frontends here. |
| `RETRIEVAL_MIN_SIMILARITY` | `0` | At 0 the kNN search always returns *something*. Raise it to ~0.3 once you have real embeddings so off-topic questions correctly hit the "no relevant reports" path. |

In production, the boot check gets stricter: `OPENAI_API_KEY`, `BREVO_API_KEY`, `CORS_ORIGINS`, and `PUBLIC_BASE_URL` all become mandatory, and `CORS_ORIGINS` is rejected if it still contains a wildcard or a localhost origin. That's deliberate — it stops a misconfigured deploy from silently serving stub AI answers and logging password reset codes.

See `.env.example` for the fully commented list.

---

## Docker

`docker-compose.yml` runs both processes — the API and the worker — off one image. There's no database container: `DATABASE_URL` in `.env` points at the hosted Postgres (Neon), exactly like `npm run dev` does.

```bash
cp .env.example .env      # DATABASE_URL, JWT_ACCESS_SECRET, the API keys
docker compose up -d --build
```

`http://localhost:8000/api/health` should then return `{"status":"ok","db":"up"}`.

A few things worth knowing:

- **One image, two services.** `api` and `worker` are the same build with different commands, sharing a compose anchor. Rebuild once, both get it.
- **Migrations run automatically** — the `api` container runs `prisma migrate deploy` before starting, and it's the only one that does, so the worker can't race it. That's also why `prisma` is a regular dependency rather than a dev one: the pruned production install still has to have the CLI.
- **Avatars live in the `uploads` volume**, because they're written to disk. `docker compose down` keeps it, `docker compose down -v` deletes it.
- **`NODE_ENV` defaults to `production`** when it isn't set in `.env`, which turns on the strict boot checks. Running the stack locally against `localhost:3000` needs `NODE_ENV=development`.
- **`API_PORT` is the host port only.** Inside the container the app always listens on 8000.

Logs and one-off commands:

```bash
docker compose logs -f api worker
docker compose exec api ./node_modules/.bin/prisma migrate status
```

`npm run seed` isn't available in the container — it's a `tsx` script and `tsx` is a devDependency — so run it from the host, where it hits the same hosted database anyway.

---

## How a question actually gets answered

`GET /api/ask` is the interesting endpoint. It's a `GET` (not a POST) because it's consumed by the browser's native `EventSource`, which only issues GETs. Roughly what happens:

1. **Quota check.** Guests get 2/day per IP, trainees 30, analysts 100, admins unlimited. Counted per UTC day across the whole endpoint.
2. **Follow-up rewriting.** If this is a continuing conversation, the last few turns go to the model to turn *"what was the weather in that one?"* into a standalone question. Without this step, retrieval on a pronoun-heavy follow-up returns garbage.
3. **Embed the query**, then a cosine-distance kNN search over `report_chunks` using pgvector's `<=>` operator against an HNSW index.
4. **Build a grounded prompt** from the top-N chunks and stream the completion back as SSE events — token by token, so the UI paints immediately instead of waiting for the full answer.
5. **Persist** the assistant message with its citations, then log the query and token usage for the admin dashboard.

If nothing clears the similarity threshold, the model is never asked to be creative — the endpoint returns the "no relevant reports" path instead. That's the whole point of the thing: an answer with no sources isn't an answer.

One subtle trap already handled in `app.ts`: **compression is disabled for `text/event-stream`**. If you don't do that, gzip buffers the response and the "streaming" arrives in one lump at the end.

---

## Auth model

Sessions are cookie-based — **no token ever touches JavaScript**.

- A short-lived (15 min) JWT access token in an httpOnly cookie.
- A long-lived (30 day) refresh token, also httpOnly, stored in the database as a **SHA-256 hash** and rotated on every use. Passwords are bcrypt with 12 rounds.
- Google OAuth via Passport, completely stateless (`session: false`). Passport only performs the code exchange; our own callback mints the same cookies as a password login.

Email verification and password reset codes are also stored hashed, with short TTLs, and are single-use.

---

## Layout

```
src/
├── server.ts          # boot: connect DB, listen
├── worker.ts          # the second process — pg-boss consumer
├── app.ts             # middleware chain; error handler mounted LAST
├── config/            # env validation, prisma, passport, queue, swagger, logger
├── routes/            # thin — just wiring + the OpenAPI JSDoc
├── controllers/       # request handling
├── services/          # the real logic: retrieval, embedding, llm, ingestion, metrics
├── middlewares/       # protect, authorize, quota, rate limits, upload, validate
├── validators/        # yup schemas used by the validate middleware
├── utils/             # AppError, catchAsync, sse, chunking, csv parsing
└── scripts/seed.ts    # offline corpus loader
```

Two conventions that run through all of it: every async handler is wrapped in `catchAsync` (so there's no try/catch noise in controllers), and every expected failure throws an `AppError` that the single global error handler turns into a clean JSON response. Mongoose-style leakage of raw database errors to clients doesn't happen.

---

## Endpoints

| | |
|---|---|
| `GET /api/health` | Liveness + DB readiness |
| **Auth** — `/api/auth` | `register`, `verify-email`, `login`, `forgot-password`, `reset-password`, `refresh`, `logout` (all POST), `GET /me`, `GET /google`, `GET /google/callback` |
| **Users** — `/api/users` | `PATCH /me`, `PUT /me/avatar`, `DELETE /me/avatar` |
| **Q&A** — `/api/ask` | `GET /` — SSE stream, auth optional, quota enforced |
| **Conversations** — `/api/conversations` | `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id` |
| **Reports** — `/api/reports` | `GET /` (analyst/admin only), `GET /:id` (any signed-in user) |
| **Notifications** — `/api/notifications` | `GET /`, `PATCH /read-all`, `PATCH /:id/read` |
| **Admin** — `/api/admin` | `GET /metrics`, `GET /users`, `PATCH /users/:id/role`, `PATCH /users/:id/status`, `POST /notifications`, `POST /ingestions`, `GET /ingestions`, `GET /ingestions/:id` |

Conversations aren't created explicitly — ask a question while signed in and one is created for you, with its id returned on the SSE `meta` event. Report summaries work the same way: `GET /api/reports/:id` generates the plain-language summary on first view and caches it on the row.

Everything under `/api/admin` sits behind a single `protect → authorize("ADMIN")` at the top of the router, so there's no chance of forgetting it on an individual route.

---

## Scripts

| Command | Does what |
|---|---|
| `npm run dev` | API with hot reload |
| `npm run worker` / `worker:dev` | Background worker (add `:dev` for watch mode) |
| `npm run build` | `prisma generate` then `tsc` |
| `npm start` / `start:worker` | Run the compiled output |
| `npm run prisma:migrate` | Apply migrations in dev |
| `npm run prisma:studio` | Browse the database in a GUI |
| `npm run seed` | Load a CSV into the corpus — `npm run seed -- path/to/file.csv` |
| `npm test` | Vitest |
| `npm run check` | typecheck + lint + format check — run this before committing |
| `npm run test:model` | Smoke-tests that your OpenAI key actually works for both chat and embeddings |

---

## Things that will trip you up

**pg-boss needs a direct database URL.** It relies on session-level Postgres features that transaction poolers (Neon's `-pooler` host, PgBouncer) don't support. If ingestion jobs mysteriously never run, set `QUEUE_DATABASE_URL` to the *non-pooled* host.

**A CSV upload does nothing without the worker.** The API only enqueues the job and returns immediately. If the worker isn't running, the ingestion sits at `QUEUED` forever and the admin dashboard looks broken. This is the single most common "it's not working" moment.

**The embedding model and the schema have to agree.** `text-embedding-3-small` produces 1536 dimensions, which is what the `vector(1536)` column expects. Switch models and you need a migration — and to re-embed everything.

**`npm run test:model`** is worth running before you blame the code. It tells you whether the key is valid, funded, and enabled for both models you need.

**`OAUTH_SUCCESS_REDIRECT` has to match a real client route.** It defaults to `http://localhost:3000/oauth-callback`, which is where the client's page actually lives. Point it somewhere that doesn't exist and Google login ends on a 404 after a successful sign-in, which looks like an auth failure but isn't.

**Email goes over Brevo's HTTPS API, not SMTP.** That's deliberate: Railway, Render and Fly all block outbound SMTP ports, so relay sends hang until they time out. If mail fails, check the server log — Brevo's rejection body is logged verbatim, and it usually says exactly what's wrong. By far the most common answer is that `EMAIL_FROM` isn't a verified sender on your Brevo account.
