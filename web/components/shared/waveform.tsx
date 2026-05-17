"use client";

import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/motion/use-reduced-motion";

const BARS = [9, 17, 12, 21, 8, 14, 19, 11];

/** Clay equalizer bars — the "live, talking" indicator. */
export function Waveform({ active = true }: { active?: boolean }) {
  const reduced = useReducedMotion();

  return (
    <div className="flex items-center gap-[3px]" aria-hidden>
      {BARS.map((h, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-clay"
          style={{ height: h }}
          animate={
            reduced || !active
              ? { scaleY: 1 }
              : { scaleY: [0.5, 1.25, 0.7, 1.1, 0.5] }
          }
          transition={{
            duration: 1.1,
            repeat: Infinity,
            delay: i * 0.08,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
