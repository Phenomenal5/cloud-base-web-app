"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { useListReportsQuery } from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import type { Category, Severity, ReportFilters } from "@/lib/types";
import { AppHeader } from "@/components/layout/AppHeader";
import { ReportDetailModal } from "@/components/reports/ReportDetailModal";
import { cn } from "@/lib/utils";

const CATEGORIES: Category[] = [
  "HUMAN_FACTORS",
  "AIRCRAFT_SYSTEMS",
  "WEATHER",
  "ATC_COMMUNICATION",
  "RUNWAY_SAFETY",
  "WILDLIFE",
  "PROCEDURAL",
  "OTHER",
];
const SEVERITIES: Severity[] = ["LOW", "MEDIUM", "HIGH"];

const SEVERITY_TEXT: Record<Severity, string> = {
  LOW: "text-emerald-600 dark:text-emerald-400",
  MEDIUM: "text-amber-600 dark:text-amber-400",
  HIGH: "text-rose-600 dark:text-rose-400",
};

const FIELD_CLASS =
  "rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand";

const PAGER_BUTTON_CLASS =
  "inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 transition hover:bg-surface-2 disabled:opacity-40";

const formatCategory = (category: string): string => {
  const words = category.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const TriageContent = () => {
  const [filters, setFilters] = useState<ReportFilters>({ page: 1 });
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const { data, isFetching } = useListReportsQuery(filters);

  // Any filter change goes back to page 1, since page 4 of the old result set
  // usually doesn't exist in the new one.
  const updateFilter = (changes: Partial<ReportFilters>) => {
    setFilters((previous) => ({ ...previous, ...changes, page: 1 }));
  };

  const goToPage = (page: number) => setFilters((previous) => ({ ...previous, page }));

  const page = data?.page ?? 1;
  const totalPages = data?.pages ?? 1;
  const hasFilters = Boolean(filters.category || filters.severity || filters.from || filters.to);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="text-xl font-semibold">Report triage</h1>
      <p className="mt-1 text-sm text-muted">
        Browse the corpus by AI-assigned category and severity.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <select
          value={filters.category ?? ""}
          onChange={(event) =>
            updateFilter({ category: (event.target.value || undefined) as Category | undefined })
          }
          className={FIELD_CLASS}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {formatCategory(category)}
            </option>
          ))}
        </select>

        <select
          value={filters.severity ?? ""}
          onChange={(event) =>
            updateFilter({ severity: (event.target.value || undefined) as Severity | undefined })
          }
          className={FIELD_CLASS}
        >
          <option value="">All severities</option>
          {SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={filters.from ?? ""}
          onChange={(event) => updateFilter({ from: event.target.value || undefined })}
          className={FIELD_CLASS}
          aria-label="From date"
        />
        <input
          type="date"
          value={filters.to ?? ""}
          onChange={(event) => updateFilter({ to: event.target.value || undefined })}
          className={FIELD_CLASS}
          aria-label="To date"
        />

        {hasFilters && (
          <button
            type="button"
            onClick={() => setFilters({ page: 1 })}
            className="text-sm text-brand hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        {/* Only spin on the very first load. Later fetches keep the old rows on
            screen so the list doesn't flash on every filter change. */}
        {isFetching && !data ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          </div>
        ) : !data || data.reports.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted">No reports match these filters.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.reports.map((report) => (
              <li key={report.id}>
                <button
                  type="button"
                  onClick={() => setOpenReportId(report.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2"
                >
                  <span className="w-16 shrink-0 font-mono text-xs text-muted">{report.acn}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {report.synopsis ?? "Untitled report"}
                  </span>
                  {report.category && (
                    <span className="hidden shrink-0 text-xs text-muted sm:inline">
                      {formatCategory(report.category)}
                    </span>
                  )}
                  {report.severity && (
                    <span
                      className={cn("shrink-0 text-xs font-medium", SEVERITY_TEXT[report.severity])}
                    >
                      {report.severity}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
            className={PAGER_BUTTON_CLASS}
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </button>
          <span className="text-muted">
            Page {page} of {totalPages} · {data.total} reports
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => goToPage(page + 1)}
            className={PAGER_BUTTON_CLASS}
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {openReportId && (
        <ReportDetailModal reportId={openReportId} onClose={() => setOpenReportId(null)} />
      )}
    </main>
  );
};

const ReportsPage = () => {
  const router = useRouter();
  const { user, status } = useAppSelector((state) => state.auth);
  // Cosmetic only. The API enforces the same rule, so hiding the page isn't the
  // access control, just the UX.
  const canView = user?.role === "ANALYST" || user?.role === "ADMIN";

  useEffect(() => {
    if (status === "guest") router.replace("/login");
    else if (status === "authenticated" && !canView) router.replace("/chat");
  }, [status, canView, router]);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      {status === "authenticated" && canView ? (
        <TriageContent />
      ) : (
        <div className="flex flex-1 justify-center py-16 text-muted">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
