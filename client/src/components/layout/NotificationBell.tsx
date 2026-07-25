"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import {
  useListNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from "@/store/api";
import type { AppNotification } from "@/lib/types";
import { cn, formatRelativeTime } from "@/lib/utils";

// Admin broadcasts are written straight to Postgres — there's no socket or push
// channel — so polling is the only way a new one reaches an open tab.
const POLL_INTERVAL_MS = 60_000;

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const { data, isLoading } = useListNotificationsQuery(undefined, {
    pollingInterval: POLL_INTERVAL_MS,
    skipPollingIfUnfocused: true, // a backgrounded tab doesn't need the traffic
  });
  const [markNotificationRead] = useMarkNotificationReadMutation();
  const [markAllNotificationsRead] = useMarkAllNotificationsReadMutation();

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unread ?? 0;

  // Escape closes the panel, matching the chat drawer's behaviour.
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Notifications carry no link target, so a click is purely a read-receipt.
  async function handleRead(notification: AppNotification) {
    if (notification.readAt) return;
    await markNotificationRead(notification.id)
      .unwrap()
      .catch(() => undefined);
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead()
      .unwrap()
      .catch(() => undefined);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={isOpen}
        className="relative rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-none text-brand-contrast">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Click-anywhere-to-close backdrop, same pattern as the account menu. */}
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-medium">Notifications</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-xs text-brand transition hover:underline"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto p-1">
              {isLoading ? (
                <p className="px-3 py-6 text-center text-xs text-muted">Loading…</p>
              ) : notifications.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted">No notifications yet.</p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {notifications.map((notification) => (
                    <li key={notification.id}>
                      {/* Spans, not divs: a <button> may only contain phrasing content. */}
                      <button
                        type="button"
                        onClick={() => handleRead(notification)}
                        className={cn(
                          "flex w-full gap-2 rounded-md px-2 py-2 text-left transition hover:bg-surface-2",
                          !notification.readAt && "bg-brand/5",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                            notification.readAt ? "bg-transparent" : "bg-brand",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span
                              className={cn(
                                "truncate text-sm",
                                !notification.readAt && "font-medium",
                              )}
                            >
                              {notification.title}
                            </span>
                            <span className="shrink-0 text-[11px] text-muted">
                              {formatRelativeTime(notification.createdAt)}
                            </span>
                          </span>
                          <span className="mt-0.5 block whitespace-pre-wrap break-words text-xs text-muted">
                            {notification.body}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
