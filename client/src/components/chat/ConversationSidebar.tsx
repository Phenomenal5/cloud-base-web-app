"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Search,
  MessageSquare,
  MoreHorizontal,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  Trash2,
  X,
} from "lucide-react";
import {
  useListConversationsQuery,
  useUpdateConversationMutation,
  useDeleteConversationMutation,
} from "@/store/api";
import { useDebounce } from "@/hooks/useDebounce";
import type { ConversationSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const MENU_ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-surface-2";

interface ConversationSidebarProps {
  activeId?: string;
  onSelect: (conversationId: string) => void;
  onNewChat: () => void;
  // Mobile drawer state. The always-on desktop column ignores both.
  isOpen?: boolean;
  onClose?: () => void;
}

export const ConversationSidebar = ({
  activeId,
  onSelect,
  onNewChat,
  isOpen = false,
  onClose,
}: ConversationSidebarProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const debouncedSearch = useDebounce(searchTerm, 300);

  const { data: conversations = [], isLoading } = useListConversationsQuery({
    search: debouncedSearch || undefined,
    archived: showArchived,
  });
  const [updateConversation] = useUpdateConversationMutation();
  const [deleteConversation] = useDeleteConversationMutation();

  // Escape closes the drawer, for keyboard parity with the close button.
  useEffect(() => {
    if (!isOpen || !onClose) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // These failures are cosmetic and RTK Query rolls the cache back on its own,
  // so there's nothing useful to say beyond closing the menu.
  const togglePin = async (conversation: ConversationSummary) => {
    setOpenMenuId(null);
    await updateConversation({ id: conversation.id, pinned: !conversation.pinned })
      .unwrap()
      .catch(() => undefined);
  };

  const toggleArchive = async (conversation: ConversationSummary) => {
    setOpenMenuId(null);
    await updateConversation({ id: conversation.id, archived: !conversation.archived })
      .unwrap()
      .catch(() => undefined);
  };

  const handleDelete = async (conversationId: string) => {
    setOpenMenuId(null);
    await deleteConversation(conversationId)
      .unwrap()
      .catch(() => undefined);
    // Deleting the thread you're reading leaves nothing to show.
    if (conversationId === activeId) onNewChat();
  };

  // Rendered in both the desktop column and the mobile drawer.
  const panelBody = (
    <>
      <div className="flex flex-col gap-2 p-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-surface-2"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search chats"
            className="w-full rounded-lg border border-border bg-surface py-1.5 pl-8 pr-2 text-sm outline-none focus:border-brand"
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-xs font-medium text-muted">
          {showArchived ? "Archived" : "Recent"}
        </span>
        <button
          type="button"
          onClick={() => setShowArchived((archived) => !archived)}
          className="text-xs text-brand hover:underline"
        >
          {showArchived ? "Show active" : "Show archived"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {isLoading ? (
          <p className="px-2 py-2 text-xs text-muted">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted">
            {debouncedSearch ? "No matches." : "No conversations yet."}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {conversations.map((conversation) => (
              <li key={conversation.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelect(conversation.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg py-2 pl-2 pr-8 text-left text-sm transition hover:bg-surface-2",
                    activeId === conversation.id && "bg-surface-2 font-medium",
                  )}
                >
                  {conversation.pinned ? (
                    <Pin className="h-3.5 w-3.5 shrink-0 text-brand" />
                  ) : (
                    <MessageSquare className="h-4 w-4 shrink-0 text-muted" />
                  )}
                  <span className="truncate">{conversation.title}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setOpenMenuId(openMenuId === conversation.id ? null : conversation.id)
                  }
                  aria-label="Conversation options"
                  className={cn(
                    "absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-muted transition hover:bg-border",
                    openMenuId === conversation.id
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100",
                  )}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>

                {openMenuId === conversation.id && (
                  <>
                    {/* Full-screen catcher so clicking anywhere else closes the menu. */}
                    <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                    <div className="absolute right-1 top-9 z-20 w-40 rounded-lg border border-border bg-surface p-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => togglePin(conversation)}
                        className={MENU_ITEM_CLASS}
                      >
                        {conversation.pinned ? (
                          <PinOff className="h-4 w-4" />
                        ) : (
                          <Pin className="h-4 w-4" />
                        )}
                        {conversation.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleArchive(conversation)}
                        className={MENU_ITEM_CLASS}
                      >
                        {conversation.archived ? (
                          <ArchiveRestore className="h-4 w-4" />
                        ) : (
                          <Archive className="h-4 w-4" />
                        )}
                        {conversation.archived ? "Unarchive" : "Archive"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(conversation.id)}
                        className={cn(MENU_ITEM_CLASS, "text-rose-600 dark:text-rose-400")}
                      >
                        <Trash2 className="h-4 w-4" /> Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Desktop: a static column from the sm breakpoint up. */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border sm:flex">
        {panelBody}
      </aside>

      {/* Mobile: scrim behind the drawer. */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-black/40 transition-opacity duration-200 sm:hidden",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Mobile: the drawer itself. */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r border-border bg-background transition-transform duration-200 ease-out sm:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-sm font-medium">Chats</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chats menu"
            className="rounded-lg p-1 text-muted transition hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {panelBody}
      </aside>
    </>
  );
};
