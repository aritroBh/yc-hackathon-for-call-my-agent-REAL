"use client";

import { Sparkle, ChevronLeft } from "lucide-react";
import { useAtlas } from "@/lib/store";

export function ChatCollapsedStrip() {
  const unread = useAtlas((s) => s.chat.unread);
  const setExpanded = useAtlas((s) => s.setChatExpanded);

  return (
    <button
      type="button"
      aria-label="Expand chat"
      onClick={() => setExpanded(true)}
      className="flex h-full w-16 flex-col items-center gap-4 border-l border-border bg-surface py-5 transition-colors hover:bg-surface-2"
    >
      <span className="relative flex size-8 items-center justify-center rounded-md bg-clay">
        <Sparkle className="size-[15px] text-white" />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex size-[18px] items-center justify-center rounded-full bg-clay-deep font-mono text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </span>
      <ChevronLeft className="size-4 text-ink-3" />
      <span
        className="font-mono text-[11px] tracking-widest text-ink-3"
        style={{ writingMode: "vertical-rl" }}
      >
        AGENT
      </span>
    </button>
  );
}
