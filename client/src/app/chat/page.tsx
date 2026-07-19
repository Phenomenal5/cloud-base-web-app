"use client";

import { useRef, useState } from "react";
import { api, useLazyGetConversationQuery } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { streamAnswer } from "@/lib/chatStream";
import { AppHeader } from "@/components/layout/AppHeader";
import { ConversationSidebar } from "@/components/chat/ConversationSidebar";
import { ChatThread, type DisplayMessage } from "@/components/chat/ChatThread";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { GuestBanner } from "@/components/chat/GuestBanner";

export default function ChatPage() {
  const dispatch = useAppDispatch();
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

  function updateMessage(id: string, changes: Partial<DisplayMessage>) {
    setMessages((previous) =>
      previous.map((message) => (message.id === id ? { ...message, ...changes } : message)),
    );
  }

  function startNewChat() {
    cancelStreamRef.current?.();
    setActiveConversationId(undefined);
    setMessages([]);
    setIsStreaming(false);
  }

  async function openConversation(conversationId: string) {
    cancelStreamRef.current?.();
    setIsStreaming(false);
    setActiveConversationId(conversationId);
    const { messages: loadedMessages } = await loadConversation(conversationId).unwrap();
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
        // A brand-new conversation was created server-side (signed-in users).
        if (meta.conversationId && !activeConversationId) {
          setActiveConversationId(meta.conversationId);
          dispatch(api.util.invalidateTags([{ type: "Conversation", id: "LIST" }]));
        }
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
      onDone: () => {
        updateMessage(assistantMessageId, { streaming: false });
        setIsStreaming(false);
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
            onSelect={(conversationId) => {
              openConversation(conversationId);
              setIsSidebarOpen(false);
            }}
            onNewChat={() => {
              startNewChat();
              setIsSidebarOpen(false);
            }}
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
