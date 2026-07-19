import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import { ingestReports } from "../services/ingestionService.js";
import { parseAsrsCsv } from "../utils/asrsCsv.js";

// ─── Offline seed script ──────────────────────────────
//
// Loads an ASRS CSV, maps its columns to reports, and ingests them (chunk →
// embed → classify → store). This is the PRD's "initial seed path" (§10.3);
// admin uploads go through the background worker (same ingestReports underneath).
//
//   pnpm seed                       # uses the bundled sample CSV
//   pnpm seed path/to/asrs.csv      # your real export

async function main() {
  const csvPath = resolve(process.argv[2] ?? "src/scripts/sample-asrs.csv");
  logger.info(`Seeding from ${csvPath}`);

  const records = parseAsrsCsv(readFileSync(csvPath, "utf8"));
  logger.info(`Parsed ${records.length} report(s); ingesting…`);

  const result = await ingestReports(records);
  logger.info(
    `Seed complete — ${result.reports} report(s), ${result.chunks} chunk(s), ${result.skipped} skipped.`,
  );
}

main()
  .catch((error) => {
    logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
