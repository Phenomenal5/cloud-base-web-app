import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env.js";

// NOTE: Prisma 7 dropped the datasource url from the schema, so the connection
// comes from a driver adapter instead. Import `prisma` from here everywhere and
// never call `new PrismaClient()` elsewhere, so the app shares one pool.

const adapter = new PrismaPg({ connectionString: env.databaseUrl });

export const prisma = new PrismaClient({ adapter });
