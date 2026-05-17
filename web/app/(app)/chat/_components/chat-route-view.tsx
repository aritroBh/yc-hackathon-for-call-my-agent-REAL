"use client";

import { useEffect } from "react";
import { MessagesSquare } from "lucide-react";
import { useAtlas } from "@/lib/store";

export function ChatRouteView() {
  const setExpanded = useAtlas((s) => s.setChatExpanded);

  useEffect(() => {
    setExpanded(true);
  }, [setExpanded]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-clay-tint">
        <MessagesSquare className="size-6 text-clay" />
      </span>
      <h1 className="font-display text-xl font-semibold text-ink">
        Your agent is in the panel
      </h1>
      <p className="max-w-sm text-sm text-ink-2">
        The conversation lives in the docked panel on the right so you can watch
        negotiations and chat at the same time.
      </p>
    </div>
  );
}
