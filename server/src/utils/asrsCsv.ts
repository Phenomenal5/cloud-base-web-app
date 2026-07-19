import Papa from "papaparse";
import type { RawReport } from "../services/ingestionService.js";

// ─── ASRS CSV parsing ─────────────────────────────────
//
// Maps an ASRS CSV export to RawReport[]. Column matching is case-insensitive
// and tolerant of common ASRS header names. Shared by the offline seed script
// and the background ingestion worker.

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

function toRawReport(row: Record<string, string>): RawReport | null {
  const acn = pick(row, HEADER_ALIASES.acn);
  const narrative = pick(row, HEADER_ALIASES.narrative);
  if (!acn || !narrative) return null;

  const dateStr = pick(row, HEADER_ALIASES.reportDate);
  const parsed = dateStr ? new Date(dateStr) : null;

  return {
    acn,
    narrative,
    synopsis: pick(row, HEADER_ALIASES.synopsis) ?? null,
    reportDate: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
  };
}

export function parseAsrsCsv(csvText: string): RawReport[] {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  return parsed.data.map(toRawReport).filter((report): report is RawReport => report !== null);
}
