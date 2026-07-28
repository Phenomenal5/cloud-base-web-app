import Papa from "papaparse";
import type { RawReport } from "../services/ingestionService.js";

// Maps an ASRS CSV export to RawReport[]. ASRS exports don't use consistent
// header names, so matching is case-insensitive across a few known aliases.
// Shared by the seed script and the ingestion worker.

const HEADER_ALIASES: Record<keyof RawReport, string[]> = {
  acn: ["acn", "accession number", "accessionnumber", "id"],
  narrative: ["narrative", "report narrative", "narrative1", "report 1 narrative"],
  synopsis: ["synopsis", "summary"],
  reportDate: ["reportdate", "date", "report date", "time / day", "date / time"],
};

function pick(row: Record<string, string>, aliases: string[]): string | undefined {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const match = entries.find(([key]) => key.trim().toLowerCase() === alias);
    if (match && match[1]?.trim()) return match[1].trim();
  }
  return undefined;
}

// Rows without an ACN or a narrative are unusable, so they're dropped here rather
// than failing the whole upload.
function toRawReport(row: Record<string, string>): RawReport | null {
  const acn = pick(row, HEADER_ALIASES.acn);
  const narrative = pick(row, HEADER_ALIASES.narrative);
  if (!acn || !narrative) return null;

  const rawDate = pick(row, HEADER_ALIASES.reportDate);
  const reportDate = rawDate ? new Date(rawDate) : null;

  return {
    acn,
    narrative,
    synopsis: pick(row, HEADER_ALIASES.synopsis) ?? null,
    reportDate: reportDate && !Number.isNaN(reportDate.getTime()) ? reportDate : null,
  };
}

export function parseAsrsCsv(csvText: string): RawReport[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  return parsed.data.map(toRawReport).filter((report): report is RawReport => report !== null);
}
