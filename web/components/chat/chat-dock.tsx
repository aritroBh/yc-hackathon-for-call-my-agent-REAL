"use client";

import { motion, AnimatePresence } from "motion/react";
import { useAtlas } from "@/lib/store";
import { chatDockWidth, chatDockTransition } from "@/lib/motion/presets";
import { ChatPanel } from "./chat-panel";
import { ChatCollapsedStrip } from "./chat-collapsed-strip";

export function ChatDock() {
  const expanded = useAtlas((s) => s.chat.expanded);

  return (
    <motion.aside
      aria-label="Agent chat"
      initial={false}
      animate={{ width: expanded ? chatDockWidth.expanded : chatDockWidth.collapsed }}
      transition={chatDockTransition}
      className="relative h-screen shrink-0 overflow-hidden"
    >
      <AnimatePresence mode="wait" initial={false}>
        {expanded ? (
          <motion.div
            key="panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0"
          >
            <ChatPanel />
          </motion.div>
        ) : (
          <motion.div
            key="strip"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0"
          >
            <ChatCollapsedStrip />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}
