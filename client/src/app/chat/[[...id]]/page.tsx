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

// an optional catch-all route, so this one component serves both /chat and
// /chat/<id>. keeping the id in the path means refresh, back/forward and
// bookmarks all land on the same thread, and because both URLs resolve to this
// same segment, moving between them never remounts and a stream survives
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
  // set once the day's allowance is gone, so the composer locks instead of
  // letting them send a question that can only fail
  const [exhaustedUntil, setExhaustedUntil] = useState<string | null>(null);

  // the dial reads the getUsage cache entry, so write the stream's number
  // straight into it rather than keeping a second copy here. upsert not update,
  // so it still lands when nothing has fetched it yet
  const updateUsage = (usage: UsageInfo) => {
    dispatch(api.util.upsertQueryData("getUsage", undefined, usage));
  };

  const [loadConversation] = useLazyGetConversationQuery();
  const cancelStreamRef = useRef<(() => void) | null>(null);
  // which thread's messages are actually in state right now. lets the URL effect
  // skip reloading something we already have, including one we just streamed
  const loadedIdRef = useRef<string | undefined>(undefined);

  const updateMessage = (id: string, changes: Partial<DisplayMessage>) => {
    setMessages((previous) =>
      previous.map((message) => (message.id === id ? { ...message, ...changes } : message)),
    );
  };

  // sidebar clicks, back/forward and a cold refresh all turn up here as a changed
  // URL param. the ref check is what stops it refetching over live messages
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
            // saved citations only have acn and reportId on them. the synopsis and
            // the score were streaming-only, so the chips render without those
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
        // gone, or never theirs. drop them back to a fresh chat
        if (cancelled) return;
        loadedIdRef.current = undefined;
        setMessages([]);
        router.replace("/chat");
      });

    return () => {
      cancelled = true;
    };
  }, [conversationIdParam, isAuthenticated, loadConversation, router]);

  // someone who leaves the tab open past midnight UTC should get their questions
  // back without reloading. at most 24h, well inside what setTimeout can hold
  useEffect(() => {
    if (!exhaustedUntil) return;
    const millisecondsUntilReset = Math.max(0, new Date(exhaustedUntil).getTime() - Date.now());
    const timer = setTimeout(() => setExhaustedUntil(null), millisecondsUntilReset);
    return () => clearTimeout(timer);
  }, [exhaustedUntil]);

  // point the URL at it and let the effect above do the actual loading
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

        // the server made a conversation for this first message, so take its id
        // and put it in the URL.
        //
        // this has to happen after streaming, never during. changing the URL
        // mid-stream, even through the History API, kicks off a next router
        // transition, and react defers the low-priority streaming updates caught
        // in it, so nothing paints until a click forces a flush. that was the
        // "I have to click the page for the answer to appear" bug. setting
        // loadedIdRef first stops the URL effect reloading a thread we already
        // have, and replaceState waits a tick so this last render paints before
        // the router re-syncs the pathname
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
        // remember the reset time so the composer can explain itself instead of
        // letting them fire off another doomed question. the quota gate refuses
        // before the handler runs, so no usage event ever arrives on this path,
        // which is why the dial is pushed to 100% from the refusal itself
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
      {/* header spans the full width, sidebar and chat sit in a row underneath */}
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
