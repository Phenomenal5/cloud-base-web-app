# Nasight API image. Built once, then runs either process off the same image:
#   API    → node dist/server.js   (the default CMD)
#   worker → node dist/worker.js   (see docker-compose.yml)

# ─── Build stage ──────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Dependencies first, so a source-only change reuses this cached layer.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# prisma.config.ts reads DATABASE_URL, and .env is (correctly) not in the image.
# `generate` never connects to anything, so a placeholder is enough to satisfy the
# config loader, the real URL is injected at runtime.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder

# `npm run build` is `prisma generate && tsc`. The generate step has to run first:
# it writes the client into src/generated/prisma, which tsc then compiles.
RUN npm run build

# Prune here instead of reinstalling in the runtime stage, so the native module
# (bcrypt) is only ever built/downloaded once.
# NOTE: `prisma` sits in dependencies, not devDependencies, precisely so it
# survives this prune, the container runs `prisma migrate deploy` on start.
RUN npm prune --omit=dev

# ─── Runtime stage ────────────────────────────────────
FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# `prisma migrate deploy` runs at container start (see docker-compose.yml), so the
# schema, the migrations and the config have to be in the runtime image too.
COPY prisma ./prisma
COPY prisma.config.ts ./

# NOTE: app.ts serves avatars via express.static(resolve("uploads")), which
# resolves against the CWD, so this has to stay exactly /app/uploads.
RUN mkdir -p uploads && chown node:node uploads
USER node

EXPOSE 8000
CMD ["node", "dist/server.js"]
