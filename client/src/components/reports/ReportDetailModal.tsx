"use client";

import { useEffect } from "react";
import Link from "next/link";
import { X, Loader2 } from "lucide-react";
import { useGetReportQuery } from "@/store/api";
import { cn } from "@/lib/utils";

const SEVERITY_STYLES: Record<string, string> = {
  LOW: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  MEDIUM: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  HIGH: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

const SECTION_HEADING_CLASS = "mb-1 text-xs font-semibold uppercase tracking-wide text-muted";

// HUMAN_FACTORS becomes "Human factors"
const formatCategory = (category: string): string => {
  const words = category.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

interface ReportDetailModalProps {
  reportId: string;
  onClose: () => void;
}

export const ReportDetailModal = ({ reportId, onClose }: ReportDetailModalProps) => {
  const { data: report, isLoading, error } = useGetReportQuery(reportId);

  // a guest can click a source chip under an answer, but the report endpoint wants
  // a session, so show them a sign-in prompt rather than a generic error
  const isUnauthorized =
    !!error &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status?: number }).status === 401;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-surface shadow-xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-semibold">{report ? `Report ACN ${report.acn}` : "Report"}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-muted transition hover:bg-surface-2"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
            </div>
          ) : isUnauthorized ? (
            <div className="py-8 text-center text-sm text-muted">
              <p>Sign in to read the full report.</p>
              <Link
                href="/login"
                className="mt-2 inline-block font-medium text-brand hover:underline"
              >
                Sign in
              </Link>
            </div>
          ) : error || !report ? (
            <p className="py-8 text-center text-sm text-muted">Couldn&apos;t load this report.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                {report.category && (
                  <span className="rounded-md bg-surface-2 px-2 py-1 text-xs">
                    {formatCategory(report.category)}
                  </span>
                )}
                {report.severity && (
                  <span
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium",
                      SEVERITY_STYLES[report.severity],
                    )}
                  >
                    {report.severity} severity
                  </span>
                )}
              </div>

              {report.synopsis && <p className="text-sm font-medium">{report.synopsis}</p>}

              {report.summary && (
                <section>
                  <h3 className={SECTION_HEADING_CLASS}>Plain-language summary</h3>
                  <p className="text-sm leading-relaxed">{report.summary}</p>
                </section>
              )}

              <section>
                <h3 className={SECTION_HEADING_CLASS}>Original narrative</h3>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">
                  {report.narrative}
                </p>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
