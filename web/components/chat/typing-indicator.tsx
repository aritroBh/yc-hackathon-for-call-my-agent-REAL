"use client";

import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/motion/use-reduced-motion";

export function TypingIndicator() {
  const reduced = useReducedMotion();
  return (
    <div
      className="flex items-center gap-1.5 rounded-md bg-surface-2 px-3.5 py-3"
      aria-label="Agent is typing"
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-ink-3"
          animate={reduced ? {} : { opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{
            duration: 0.9,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
