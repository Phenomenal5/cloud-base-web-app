"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plane } from "lucide-react";
import { useAppSelector } from "@/store/hooks";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

// Shared shell for the auth pages. Signed-in users are bounced into the app —
// auth pages are for guests/returning users only.
//
// NOTE: this status-driven redirect is the RELIABLE way in. The auth pages also
// push to /chat imperatively for snappiness, but that push can race the login
// mutation's setUser dispatch and get dropped ("sometimes never routes"). This
// effect reacts to the COMMITTED auth status, so it always lands the user in the
// app. Target must match the pages' push target (/chat) so they never fight over
// two different destinations.
export default function AuthLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const status = useAppSelector((state) => state.auth.status);

  useEffect(() => {
    if (status === "authenticated") router.replace("/chat");
  }, [status, router]);

  return (
    <main className="relative flex flex-1 items-center justify-center px-4 py-12">
      <div className="fixed right-4 top-4 z-50">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-8 flex items-center justify-center gap-2 text-lg font-semibold"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <Plane className="h-4 w-4" />
          </span>
          AeroLens
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          {children}
        </div>
      </div>
    </main>
  );
}
