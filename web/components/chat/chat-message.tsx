"use client";

import { motion } from "motion/react";
import { Sparkle } from "lucide-react";
import type { ChatMessage as Msg } from "@/lib/types";
import { fadeUp, fadeUpTransition } from "@/lib/motion/presets";
import { cn } from "@/lib/utils";

export function ChatMessage({ message }: { message: Msg }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      variants={fadeUp}
      initial="initial"
      animate="animate"
      transition={fadeUpTransition}
      className={cn("flex gap-2.5", isUser ? "justify-end" : "items-start")}
    >
      {!isUser && (
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-clay">
          <Sparkle className="size-3.5 text-white" />
        </span>
      )}
      <div
        className={cn(
          "max-w-[80%] rounded-md px-3.5 py-2.5 text-[14px] leading-relaxed",
          isUser
            ? "bg-clay-tint text-ink"
            : "bg-surface-2 text-ink",
        )}
      >
        {message.content}
      </div>
    </motion.div>
  );
}
