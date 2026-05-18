"use client";

import { usePathname } from "next/navigation";
import { ChatDock } from "./chat-dock";

const HIDDEN_PREFIXES = ["/settings", "/research"];

export function ChatDockGate() {
  const pathname = usePathname();
  const hidden = HIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );

  if (hidden) return null;

  return <ChatDock />;
}
