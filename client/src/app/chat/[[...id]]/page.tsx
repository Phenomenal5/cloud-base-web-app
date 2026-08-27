"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, useLazyGetConversationQuery } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { streamAnswer } from "@/lib/chatStream";
import type { UsageInfo } from "@/lib/types";
import { AppHeader } from "@/components/layout/AppHeader";
import { ConversationSidebar } from "@/components/chat/ConversationSidebar";
import { ChatThread, type DisplayMessage } from "@/components/chat/ChatThread";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { GuestBanner } from "@/components/chat/GuestBanner";

// An optional catch-all route, so this one component serves both /chat and
// /chat/<id>. Keeping the id in the path means refresh, back/forward and
// bookmarks all land in the same thread, and because both URLs resolve to this
// same segment, moving between them never remounts and streaming survives.
const ChatPage = () => {
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
  // Set once the daily allowance is spent, so the composer locks instead of
  // letting them send a question that can only fail.
  const [exhaustedUntil, setExhaustedUntil] = useState<string | null>(null);

  // The usage indicator reads the getUsage cache entry, so the stream's figure is
  // written straight into it rather than kept in a second copy here. upsert
  // rather than update, so it also lands when nothing has fetched it yet.
  const updateUsage = (usage: UsageInfo) => {
    dispatch(api.util.upsertQueryData("getUsage", undefined, usage));
  };

  const [loadConversation] = useLazyGetConversationQuery();
  const cancelStreamRef = useRef<(() => void) | null>(null);
  // Which conversation's messages are currently in state. Lets the URL effect
  // skip reloading a thread we already have, including one we just streamed.
  const loadedIdRef = useRef<string | undefined>(undefined);

  const updateMessage = (id: string, changes: Partial<DisplayMessage>) => {
    setMessages((previous) =>
      previous.map((message) => (message.id === id ? { ...message, ...changes } : message)),
    );
  };

  // Sidebar clicks, back/forward and a cold refresh all arrive here as a changed
  // URL param. The ref check is what stops it refetching over live messages.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (conversationIdParam === loadedIdRef.current) return;

    cancelStreamRef.current?.();
    /* eslint-disable react-hooks/set-state-in-effect -- syncing to the URL param,
       which is external input, not a render cascade. */
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
            // Stored citations only carry acn and reportId. The synopsis and
            // score were streaming-only, so the chips render without them.
            sources: message.citations?.map((citation) => ({
              acn: citation.acn,
              reportId: citation.reportId,
              synopsis: null,
              similarity: 0,
            })),
          })),
        );
      })
      .catch(() => {
        // Not found, or not theirs. Drop back to a fresh chat.
        if (cancelled) return;
        loadedIdRef.current = undefined;
        setMessages([]);
        router.replace("/chat");
      });

    return () => {
      cancelled = true;
    };
  }, [conversationIdParam, isAuthenticated, loadConversation, router]);

  // Someone who leaves the tab open past midnight UTC should get their questions
  // back without reloading. The delay is at most 24h, well inside setTimeout's range.
  useEffect(() => {
    if (!exhaustedUntil) return;
    const millisecondsUntilReset = Math.max(0, new Date(exhaustedUntil).getTime() - Date.now());
    const timer = setTimeout(() => setExhaustedUntil(null), millisecondsUntilReset);
    return () => clearTimeout(timer);
  }, [exhaustedUntil]);

  // Point the URL at it and let the effect above do the loading.
  const selectConversation = (conversationId: string) => {
    setIsSidebarOpen(false);
    router.push(`/chat/${conversationId}`);
  };

  const startNewChat = () => {
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
  };

  const sendMessage = (text: string) => {
    if (isStreaming || exhaustedUntil) return;

    const assistantMessageId = crypto.randomUUID();
    setMessages((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: "USER", content: text },
      { id: assistantMessageId, role: "ASSISTANT", content: "", streaming: true },
    ]);
    setIsStreaming(true);

    cancelStreamRef.current = streamAnswer(text, activeConversationId, {
      onUsage: updateUsage,
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

        // The server created a conversation for this first message, so adopt its
        // id and put it in the URL.
        //
        // NOTE: this has to happen after streaming, never during. Changing the
        // URL mid-stream, even through the History API, starts a Next router
        // transition, and React defers the low-priority streaming updates caught
        // in it, so nothing paints until a click forces a flush. That was the
        // "I have to click the page for the response to appear" bug. Setting
        // loadedIdRef first stops the URL effect reloading a thread we already
        // have, and replaceState is deferred a tick so this last render paints
        // before the router re-syncs the pathname.
        if (done.conversationId && !activeConversationId) {
          const newConversationId = done.conversationId;
          loadedIdRef.current = newConversationId;
          setActiveConversationId(newConversationId);
          dispatch(api.util.invalidateTags([{ type: "Conversation", id: "LIST" }]));
          setTimeout(() => window.history.replaceState(null, "", `/chat/${newConversationId}`), 0);
        }
      },
      onError: (error) => {
        updateMessage(assistantMessageId, { streaming: false, error });
        setIsStreaming(false);
        // Remember the reset time so the composer explains itself instead of
        // letting them fire off another doomed question.
        // The gate refuses before the handler runs, so no usage event is sent on
        // this path — the indicator is brought to 100% from the refusal itself.
        if (error.code === "QUOTA_EXCEEDED" && error.resetsAt) {
          setExhaustedUntil(error.resetsAt);
          updateUsage({
            limit: error.limit ?? null,
            used: error.used ?? error.limit ?? 0,
            remaining: 0,
            percentUsed: 100,
            resetsAt: error.resetsAt,
          });
        }
      },
    });
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* The header spans the full width; the sidebar and chat sit in a row below. */}
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
          <ChatComposer
            onSend={sendMessage}
            disabled={isStreaming}
            exhaustedUntil={exhaustedUntil}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
