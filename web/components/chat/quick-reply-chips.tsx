"use client";

import { motion } from "motion/react";
import { staggerParent, staggerChild, staggerChildTransition } from "@/lib/motion/presets";

export function QuickReplyChips({
  replies,
  onPick,
}: {
  replies: string[];
  onPick: (value: string) => void;
}) {
  return (
    <motion.div
      variants={staggerParent}
      initial="initial"
      animate="animate"
      className="flex flex-wrap gap-2 pl-[38px]"
    >
      {replies.map((reply) => (
        <motion.button
          key={reply}
          type="button"
          variants={staggerChild}
          transition={staggerChildTransition}
          onClick={() => onPick(reply)}
          className="rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-clay hover:text-clay-deep"
        >
          {reply}
        </motion.button>
      ))}
    </motion.div>
  );
}
