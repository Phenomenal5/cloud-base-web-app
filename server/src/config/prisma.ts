import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env.js";

// ─── Prisma client (singleton) ────────────────────────
//
// Prisma 7 removed the datasource `url` from the schema — the runtime connection
// comes from a driver adapter. We use the pg adapter (standard Postgres: Neon /
// Supabase). Import `prisma` from here everywhere; never `new PrismaClient()`
// elsewhere, so the whole app shares one connection pool.

const adapter = new PrismaPg({ connectionString: env.databaseUrl });

export const prisma = new PrismaClient({ adapter });
