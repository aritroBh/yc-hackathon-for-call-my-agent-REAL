"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Sparkle, PanelRightClose, ArrowUp, PhoneCall } from "lucide-react";
import { useAtlas } from "@/lib/store";
import { ChatMessage } from "./chat-message";
import { QuickReplyChips } from "./quick-reply-chips";
import { TypingIndicator } from "./typing-indicator";

export function ChatPanel() {
  const messages = useAtlas((s) => s.chat.messages);
  const agentTyping = useAtlas((s) => s.chat.agentTyping);
  const callingStarted = useAtlas((s) => s.callingStarted);
  const setExpanded = useAtlas((s) => s.setChatExpanded);
  const pushChatMessage = useAtlas((s) => s.pushChatMessage);
  const triggerMagicMoment = useAtlas((s) => s.triggerMagicMoment);

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, agentTyping]);

  const lastAgent = [...messages].reverse().find((m) => m.role === "agent");

  function send(content: string) {
    if (!content.trim()) return;
    pushChatMessage({
      id: `u_${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    });
    setDraft("");
  }

  return (
    <div className="flex h-full w-[448px] flex-col bg-surface">
      <header className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <span className="flex size-7 items-center justify-center rounded-md bg-clay">
          <Sparkle className="size-3.5 text-white" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[14px] font-semibold text-ink">
            Sourcing agent
          </span>
          <span className="font-mono text-[11px] text-ink-3">
            {callingStarted ? "On the calls" : "Gathering details"}
          </span>
        </span>
        <button
          type="button"
          aria-label="Collapse chat"
          onClick={() => setExpanded(false)}
          className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <PanelRightClose className="size-[18px]" />
        </button>
      </header>

      <div
        ref={scrollRef}
        className="scroll-fade flex-1 space-y-4 overflow-y-auto px-5 py-5"
      >
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} />
        ))}

        {lastAgent?.quickReplies && !callingStarted && (
          <QuickReplyChips replies={lastAgent.quickReplies} onPick={send} />
        )}

        <AnimatePresence>{agentTyping && <TypingIndicator />}</AnimatePresence>

        {!callingStarted && (
          <button
            type="button"
            onClick={() => {
              triggerMagicMoment();
              setExpanded(false);
            }}
            className="ml-[38px] flex items-center gap-2 rounded-md bg-clay px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-clay-deep"
          >
            <PhoneCall className="size-4" />
            Start calling 6 suppliers
          </button>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex items-center gap-2.5 border-t border-border px-4 py-4"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message your agent…"
          aria-label="Message your agent"
          className="flex-1 rounded-md border border-border bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink outline-none placeholder:text-ink-3 focus-visible:border-clay"
        />
        <button
          type="submit"
          aria-label="Send message"
          className="flex size-[38px] items-center justify-center rounded-md bg-clay text-white transition-colors hover:bg-clay-deep"
        >
          <ArrowUp className="size-4" />
        </button>
      </form>
    </div>
  );
}
