"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAppSelector } from "@/store/hooks";

const CTA_CLASS =
  "inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-3 text-sm font-medium text-white transition hover:opacity-90";

// /api/ask is optionalAuth, so anyone can start asking. We lead with that and
// only mention accounts as the way to keep your history.
export const HomeCta = () => {
  const { user, status } = useAppSelector((state) => state.auth);

  if (status === "authenticated" && user) {
    return (
      <div className="mt-8 flex flex-col items-center gap-3">
        <Link href="/chat" className={CTA_CLASS}>
          Open chat <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="text-sm text-slate-500">
          Signed in as <span className="font-medium text-foreground">{user.displayName}</span>
        </p>
      </div>
    );
  }

  // Guests, and anyone whose session is still resolving.
  return (
    <div className="mt-8 flex flex-col items-center gap-4">
      <Link href="/chat" className={CTA_CLASS}>
        Start asking <ArrowRight className="h-4 w-4" />
      </Link>

      <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">
        No account needed to try it. Your conversations won&apos;t be saved in guest mode, sign in
        to keep your chat history.
      </p>

      <div className="flex items-center gap-2 text-sm">
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
        <span className="text-slate-300 dark:text-slate-700">·</span>
        <Link href="/register" className="font-medium text-brand hover:underline">
          Create account
        </Link>
      </div>
    </div>
  );
};
