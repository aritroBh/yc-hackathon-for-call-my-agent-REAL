"use client";

import { MotionConfig } from "motion/react";
import { EASE, DUR } from "@/lib/motion/presets";
import { StoreHydrator } from "@/lib/store/store-hydrator";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: DUR.base, ease: EASE.standard }}
    >
      <StoreHydrator />
      {children}
    </MotionConfig>
  );
}
