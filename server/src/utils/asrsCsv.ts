import Papa from "papaparse";
import type { RawReport } from "../services/ingestionService.js";

// turns an ASRS CSV export into RawReport[]. their exports don't use consistent
// column names, so we match case-insensitively against the aliases below

const HEADER_ALIASES: Record<keyof RawReport, string[]> = {
  acn: ["acn", "accession number", "accessionnumber", "id"],
  narrative: ["narrative", "report narrative", "narrative1", "report 1 narrative"],
  synopsis: ["synopsis", "summary"],
  reportDate: ["reportdate", "date", "report date", "time / day", "date / time"],
};

// first alias that matches a column and has something in it wins
function pick(row: Record<string, string>, aliases: string[]): string | undefined {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const match = entries.find(([key]) => key.trim().toLowerCase() === alias);
    if (match && match[1]?.trim()) return match[1].trim();
  }
  return undefined;
}

function toRawReport(row: Record<string, string>): RawReport | null {
  // no ACN or no narrative and the row is useless. drop it rather than failing
  // the entire upload over one bad line
  const acn = pick(row, HEADER_ALIASES.acn);
  const narrative = pick(row, HEADER_ALIASES.narrative);
  if (!acn || !narrative) return null;

  // dates in these exports are all over the place, so keep it only if it parses
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
