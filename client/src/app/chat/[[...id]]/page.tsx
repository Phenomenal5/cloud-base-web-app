"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, useLazyGetConversationQuery } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { streamAnswer } from "@/lib/chatStream";
import { AppHeader } from "@/components/layout/AppHeader";
import { ConversationSidebar } from "@/components/chat/ConversationSidebar";
import { ChatThread, type DisplayMessage } from "@/components/chat/ChatThread";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { GuestBanner } from "@/components/chat/GuestBanner";

// Optional catch-all route: this one component serves BOTH /chat (new chat) and
// /chat/<conversationId>. The id lives in the path so refresh / back-forward /
// bookmarking keep you in the same thread, and because both URLs resolve to this
// same segment, navigating between them never remounts (streaming survives).
export default function ChatPage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const params = useParams<{ id?: string[] }>();
  const conversationIdParam = params.id?.[0];

  const { user, status } = useAppSelector((state) => state.auth);
  const isAuthenticated = status === "authenticated";

  const [activeConversationId, setActiveConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [quota, setQuota] = useState<{ limit: number | null; remaining: number | null } | null>(
    null,
  );

  const [loadConversation] = useLazyGetConversationQuery();
  const cancelStreamRef = useRef<(() => void) | null>(null);
  // The conversation whose messages are currently in state — lets the URL effect
  // skip reloading a thread we already have (e.g. one we just created streaming).
  const loadedIdRef = useRef<string | undefined>(undefined);

  function updateMessage(id: string, changes: Partial<DisplayMessage>) {
    setMessages((previous) =>
      previous.map((message) => (message.id === id ? { ...message, ...changes } : message)),
    );
  }

  // ── Load the thread whenever the URL's /chat/<id> changes ──
  // Sidebar clicks, back/forward, and the initial refresh all flow through here.
  // Skips when the id already matches what's loaded so we don't refetch over
  // live (just-streamed) messages.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (conversationIdParam === loadedIdRef.current) return;

    cancelStreamRef.current?.();
    /* eslint-disable react-hooks/set-state-in-effect -- intentional: sync loaded
       state to the URL param (external input), not a render cascade. */
    setIsStreaming(false);

    if (!conversationIdParam) {
      loadedIdRef.current = undefined;
      setActiveConversationId(undefined);
      setMessages([]);
      return;
    }

    loadedIdRef.current = conversationIdParam;
    setActiveConversationId(conversationIdParam);
    /* eslint-enable react-hooks/set-state-in-effect */

    let cancelled = false;
    loadConversation(conversationIdParam)
      .unwrap()
      .then(({ messages: loadedMessages }) => {
        if (cancelled) return;
        setMessages(
          loadedMessages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            sources: message.citations
              ? message.citations.map((citation) => ({
                  acn: citation.acn,
                  reportId: citation.reportId,
                  synopsis: null,
                  similarity: 0,
                }))
              : undefined,
          })),
        );
      })
      .catch(() => {
        // Not found / not owned — drop back to a fresh chat.
        if (cancelled) return;
        loadedIdRef.current = undefined;
        setMessages([]);
        router.replace("/chat");
      });

    return () => {
      cancelled = true;
    };
  }, [conversationIdParam, isAuthenticated, loadConversation, router]);

  // Sidebar select → point the URL at it; the effect above loads it.
  function selectConversation(conversationId: string) {
    setIsSidebarOpen(false);
    router.push(`/chat/${conversationId}`);
  }

  function startNewChat() {
    setIsSidebarOpen(false);
    cancelStreamRef.current?.();
    setIsStreaming(false);
    if (conversationIdParam) {
      router.push("/chat"); // the effect clears the thread
    } else {
      loadedIdRef.current = undefined;
      setActiveConversationId(undefined);
      setMessages([]);
    }
  }

  function sendMessage(text: string) {
    if (isStreaming) return;

    const assistantMessageId = crypto.randomUUID();
    setMessages((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: "USER", content: text },
      { id: assistantMessageId, role: "ASSISTANT", content: "", streaming: true },
    ]);
    setIsStreaming(true);

    cancelStreamRef.current = streamAnswer(text, activeConversationId, {
      onMeta: (meta) => {
        if (meta.quota) setQuota(meta.quota);
      },
      onSources: (sources) => updateMessage(assistantMessageId, { sources }),
      onToken: (chunk) =>
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantMessageId
              ? { ...message, content: message.content + chunk }
              : message,
          ),
        ),
      onDone: (done) => {
        updateMessage(assistantMessageId, { streaming: false });
        setIsStreaming(false);
        // A brand-new conversation was created server-side (signed-in users). Adopt
        // its id and reflect it in the URL so refresh/bookmark keep this thread.
        //
        // Do this AFTER streaming, never mid-stream. Changing the URL while tokens
        // are arriving — even via the History API — makes Next start a router
        // transition, and React defers the low-priority streaming updates caught in
        // it, so nothing paints until a click forces a flush (the "I have to click
        // the page for the response to come in" bug). By onDone there are no more
        // updates to stall. loadedIdRef is set first so the URL effect skips
        // reloading a thread we already have; replaceState is deferred one tick so
        // this final render paints before the router re-syncs the pathname.
        if (done.conversationId && !activeConversationId) {
          const newId = done.conversationId;
          loadedIdRef.current = newId;
          setActiveConversationId(newId);
          dispatch(api.util.invalidateTags([{ type: "Conversation", id: "LIST" }]));
          setTimeout(() => window.history.replaceState(null, "", `/chat/${newId}`), 0);
        }
      },
      onError: (message) => {
        updateMessage(assistantMessageId, { streaming: false, error: message });
        setIsStreaming(false);
      },
    });
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Navbar spans the full width; the sidebar and chat area sit in a row below it. */}
      <AppHeader onMenuClick={isAuthenticated ? () => setIsSidebarOpen(true) : undefined} />

      <div className="flex flex-1 overflow-hidden">
        {isAuthenticated && (
          <ConversationSidebar
            activeId={activeConversationId}
            onSelect={selectConversation}
            onNewChat={startNewChat}
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
          />
        )}

        <div className="flex flex-1 flex-col overflow-hidden">
          {!isAuthenticated && <GuestBanner />}
          <ChatThread messages={messages} userName={user?.displayName} onExample={sendMessage} />
          <ChatComposer onSend={sendMessage} disabled={isStreaming} quota={quota} />
        </div>
      </div>
    </div>
  );
}
