"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plane } from "lucide-react";
import { useAppSelector } from "@/store/hooks";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

// shared shell for the auth pages, and it bounces signed-in users into the app.
//
// this status-driven redirect is the reliable one. the pages push to /chat as
// well for speed, but that push can run before the login mutation's setUser has
// committed and just get dropped, which is why sign-in sometimes looked like it
// did nothing. reacting to committed status can't race. keep the target at
// /chat, matching the pages, or the two fight over where to go
const AuthLayout = ({ children }: { children: ReactNode }) => {
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
          Nasight
        </Link>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
};

export default AuthLayout;
