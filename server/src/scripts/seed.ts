import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";
import { ingestReports } from "../services/ingestionService.js";
import { parseAsrsCsv } from "../utils/asrsCsv.js";

// Offline seed path. Admin uploads go through the worker instead, but both end
// up in the same ingestReports().
//
//   npm run seed                    uses the bundled sample CSV
//   npm run seed path/to/asrs.csv   uses a real export

async function main() {
  const csvPath = resolve(process.argv[2] ?? "src/scripts/sample-asrs.csv");
  logger.info(`Seeding from ${csvPath}`);

  const records = parseAsrsCsv(readFileSync(csvPath, "utf8"));
  logger.info(`Parsed ${records.length} report(s), ingesting`);

  const result = await ingestReports(records);
  logger.info(
    `Seed complete: ${result.reports} report(s), ${result.chunks} chunk(s), ${result.skipped} skipped.`,
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
