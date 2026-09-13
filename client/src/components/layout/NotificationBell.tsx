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

// admin broadcasts go straight into postgres, there's no socket or push channel
// anywhere in this stack, so polling is the only way an open tab finds out
const POLL_INTERVAL_MS = 60_000;

export const NotificationBell = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { data, isLoading } = useListNotificationsQuery(undefined, {
    pollingInterval: POLL_INTERVAL_MS,
    skipPollingIfUnfocused: true,
  });
  const [markNotificationRead] = useMarkNotificationReadMutation();
  const [markAllNotificationsRead] = useMarkAllNotificationsReadMutation();

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unread ?? 0;

  // escape closes the panel, same as the chat drawer
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // notifications have nowhere to link to, so a click is only a read receipt
  const handleRead = async (notification: AppNotification) => {
    if (notification.readAt) return;
    await markNotificationRead(notification.id)
      .unwrap()
      .catch(() => undefined);
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead()
      .unwrap()
      .catch(() => undefined);
  };

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
                      {/* spans, not divs. a <button> only takes phrasing
                      content, a div inside one is invalid HTML */}
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
                          <span className="mt-0.5 block whitespace-pre-wrap wrap-break-word text-xs text-muted">
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
};
