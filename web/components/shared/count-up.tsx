"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "motion/react";
import { useReducedMotion } from "@/lib/motion/use-reduced-motion";
import { DUR, EASE } from "@/lib/motion/presets";
import { cn } from "@/lib/utils";

/** Animated integer counter in Fraunces — used for KPI numerals. */
export function CountUp({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    if (reduced || prev.current === value) {
      setDisplay(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration: DUR.slow,
      ease: EASE.standard,
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, reduced]);

  return (
    <span className={cn("font-display tabular", className)}>{display}</span>
  );
}
