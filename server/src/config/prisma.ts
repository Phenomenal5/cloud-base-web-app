import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env.js";

// Prisma 7 dropped the datasource url from the schema, so the connection comes
// from a driver adapter. Import `prisma` from here so the app shares one pool.

const adapter = new PrismaPg({ connectionString: env.databaseUrl });

export const prisma = new PrismaClient({ adapter });
