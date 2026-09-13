"use client";

import { useEffect, useRef, useState } from "react";
import { Plane, FileText } from "lucide-react";
import type { Source } from "@/lib/types";
import type { StreamError } from "@/lib/chatStream";
import { ReportDetailModal } from "@/components/reports/ReportDetailModal";
import { Markdown } from "@/components/chat/Markdown";
import { QuotaNotice } from "@/components/chat/QuotaNotice";

export interface DisplayMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  sources?: Source[];
  streaming?: boolean;
  error?: StreamError;
}

const EXAMPLE_PROMPTS = [
  "What causes runway incursions?",
  "Fatigue on night approaches",
  "Bird strikes during takeoff",
  "Why do crews continue unstable approaches?",
];

const timeOfDayGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

interface ChatThreadProps {
  messages: DisplayMessage[];
  userName?: string;
  onExample: (prompt: string) => void;
}

export const ChatThread = ({ messages, userName, onExample }: ChatThreadProps) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [greeting, setGreeting] = useState("Hello");
  const [openReportId, setOpenReportId] = useState<string | null>(null);

  // deferred to a mount effect. the greeting reads the browser's local clock,
  // which the server has no way of knowing, so doing it in render mismatches
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setGreeting(timeOfDayGreeting()), []);

  // instant, not smooth. this fires on every streamed token, and a smooth scroll
  // that restarts a few times a second never actually settles anywhere
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages]);

  if (messages.length === 0) {
    const firstName = userName?.split(" ")[0];
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <Plane className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold">
          {greeting}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-2 text-muted">What would you like to know about aviation safety?</p>
        <div className="mt-6 flex max-w-lg flex-wrap justify-center gap-2">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onExample(prompt)}
              className="rounded-full border border-border px-3 py-1.5 text-sm text-muted transition hover:border-brand hover:text-foreground"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* min-h-0 is load-bearing. without it this flex child won't shrink below its
          content, so it grows to the full message height and clips instead of
          scrolling. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
          {messages.map((message) =>
            message.role === "USER" ? (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-surface-2 px-4 py-2.5 text-sm">
                  {message.content}
                </div>
              </div>
            ) : (
              <div key={message.id} className="flex gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Plane className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  {message.content ? (
                    <div className="text-sm leading-relaxed">
                      <Markdown>{message.content}</Markdown>
                      {message.streaming && <span className="ml-0.5 animate-pulse">▍</span>}
                    </div>
                  ) : message.streaming ? (
                    <p className="text-sm text-muted">Searching the reports…</p>
                  ) : null}

                  {/* running out of questions isn't a failure, so it gets its own
                      panel with the reset time rather than a red error line. */}
                  {message.error &&
                    (message.error.code === "QUOTA_EXCEEDED" ? (
                      <div className="mt-2">
                        <QuotaNotice error={message.error} />
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
                        {message.error.message}
                      </p>
                    ))}

                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-xs font-medium text-muted">Sources</p>
                      <div className="flex flex-wrap gap-1.5">
                        {message.sources.map((source) => (
                          <button
                            key={source.reportId}
                            type="button"
                            onClick={() => setOpenReportId(source.reportId)}
                            title={source.synopsis ?? undefined}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition hover:border-brand hover:text-foreground"
                          >
                            <FileText className="h-3 w-3" /> ACN {source.acn}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {openReportId && (
        <ReportDetailModal reportId={openReportId} onClose={() => setOpenReportId(null)} />
      )}
    </>
  );
};
