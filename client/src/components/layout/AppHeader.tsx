"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plane, LogOut, ChevronDown, PanelLeft } from "lucide-react";
import { useLogoutMutation } from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { Avatar } from "@/components/ui/Avatar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NotificationBell } from "@/components/layout/NotificationBell";

interface AppHeaderProps {
  // Chat page passes this to open the conversation drawer on mobile; other
  // pages leave it undefined, so no menu button shows.
  onMenuClick?: () => void;
}

export function AppHeader({ onMenuClick }: AppHeaderProps = {}) {
  const router = useRouter();
  const { user, status } = useAppSelector((state) => state.auth);
  const [logout] = useLogoutMutation();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    setMenuOpen(false);
    await logout()
      .unwrap()
      .catch(() => undefined);
    router.push("/");
  }

  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
      <div className="flex items-center gap-1">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open chats menu"
            className="-ml-1 rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-foreground sm:hidden"
          >
            <PanelLeft className="h-5 w-5" />
          </button>
        )}
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <Plane className="h-4 w-4" />
          </span>
          AeroLens
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        {status === "authenticated" && user ? (
          <>
            {/* Inside the auth branch so the feed is never fetched for a guest. */}
            <NotificationBell />
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 text-sm transition hover:bg-surface-2"
              >
                <Avatar name={user.displayName} src={user.avatarUrl} size={28} />
                <span className="hidden sm:inline">{user.displayName}</span>
                <ChevronDown className="h-4 w-4 text-muted" />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-border bg-surface p-1 shadow-lg">
                    <div className="px-3 py-2">
                      <p className="truncate text-sm font-medium">{user.displayName}</p>
                      <p className="truncate text-xs text-muted">{user.email}</p>
                    </div>
                    <Link
                      href="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-md px-3 py-2 text-sm transition hover:bg-surface-2"
                    >
                      Profile
                    </Link>
                    {(user.role === "ANALYST" || user.role === "ADMIN") && (
                      <Link
                        href="/reports"
                        onClick={() => setMenuOpen(false)}
                        className="block rounded-md px-3 py-2 text-sm transition hover:bg-surface-2"
                      >
                        Report triage
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-rose-600 transition hover:bg-surface-2 dark:text-rose-400"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <Link
            href="/login"
            className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-brand-contrast transition hover:bg-brand-hover"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
