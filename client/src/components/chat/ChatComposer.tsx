"use client";

import { useState, type KeyboardEvent } from "react";
import { ArrowUp, TimerReset } from "lucide-react";
import { formatLocalTime, formatTimeUntil } from "@/lib/utils";
import { UsageIndicator } from "./UsageIndicator";

const MAX_QUERY_LENGTH = 500;

interface ChatComposerProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  // set once they're out of questions. locks the box instead of letting someone
  // type out a whole question that can only fail
  exhaustedUntil?: string | null;
}

export const ChatComposer = ({ onSend, disabled, exhaustedUntil }: ChatComposerProps) => {
  const [text, setText] = useState("");
  const isOutOfQuota = Boolean(exhaustedUntil);
  const isLocked = isOutOfQuota || disabled;

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || isLocked) return;
    onSend(trimmed);
    setText("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // enter sends, shift+enter is a newline
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  // the reset time when they're out, otherwise the usual grounding note. no
  // running count here on purpose, "N of M left today" sitting under every
  // keystroke turned the composer into a countdown clock. it lives behind the
  // dial next to the send button now, for whoever actually wants to look
  const footerText = () => {
    if (exhaustedUntil) {
      return `No questions left today, resets ${formatTimeUntil(exhaustedUntil)}, at ${formatLocalTime(exhaustedUntil)}.`;
    }
    return "Answers are grounded in NASA ASRS reports.";
  };

  return (
    <div className="border-t border-border p-3">
      <div
        className={`mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-surface p-2 focus-within:border-brand ${
          isOutOfQuota ? "opacity-60" : ""
        }`}
      >
        <textarea
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          // only the quota actually disables the box. `disabled` just means a stream is
          // running, and you should still be able to type the next question while it does
          disabled={isOutOfQuota}
          placeholder={
            isOutOfQuota
              ? "You've used all your questions for today"
              : "Ask about an aviation safety topic…"
          }
          maxLength={MAX_QUERY_LENGTH}
          className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted disabled:cursor-not-allowed"
        />
        {/* renders nothing for guests, they get the sign-up banner instead */}
        <UsageIndicator />
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
        {isOutOfQuota && <TimerReset className="h-3 w-3 shrink-0" />}
        {footerText()}
      </p>
    </div>
  );
};
