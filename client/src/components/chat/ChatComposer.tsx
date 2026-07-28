"use client";

import { useState, type KeyboardEvent } from "react";
import { ArrowUp, TimerReset } from "lucide-react";
import type { QuotaState } from "@/lib/chatStream";
import { formatLocalTime, formatTimeUntil } from "@/lib/utils";

interface ChatComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  quota?: QuotaState | null;
  // Set once the daily allowance is spent. Locks the box rather than letting
  // someone type a question that can only fail.
  exhaustedUntil?: string | null;
}

export function ChatComposer({ onSend, disabled, quota, exhaustedUntil }: ChatComposerProps) {
  const [text, setText] = useState("");
  const isLocked = Boolean(exhaustedUntil) || disabled;

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || isLocked) return;
    onSend(trimmed);
    setText("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  // Footer line: reset time when spent, a countdown as it runs low, else the
  // standard grounding note.
  function footerText() {
    if (exhaustedUntil) {
      return `No questions left today — resets ${formatTimeUntil(exhaustedUntil)}, at ${formatLocalTime(exhaustedUntil)}.`;
    }
    if (quota && quota.limit !== null && quota.remaining !== null) {
      if (quota.remaining === 0 && quota.resetsAt) {
        return `That was your last question for today — resets at ${formatLocalTime(quota.resetsAt)}.`;
      }
      return `${quota.remaining} of ${quota.limit} questions left today`;
    }
    return "Answers are grounded in NASA ASRS reports.";
  }

  return (
    <div className="border-t border-border p-3">
      <div
        className={`mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-surface p-2 focus-within:border-brand ${
          exhaustedUntil ? "opacity-60" : ""
        }`}
      >
        <textarea
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={Boolean(exhaustedUntil)}
          placeholder={
            exhaustedUntil
              ? "You've used all your questions for today"
              : "Ask about an aviation safety topic…"
          }
          maxLength={500}
          className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={submit}
          disabled={isLocked || !text.trim()}
          aria-label="Send"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-brand-contrast transition hover:bg-brand-hover disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1.5 flex items-center justify-center gap-1 text-center text-[11px] text-muted">
        {exhaustedUntil && <TimerReset className="h-3 w-3 shrink-0" />}
        {footerText()}
      </p>
    </div>
  );
}
