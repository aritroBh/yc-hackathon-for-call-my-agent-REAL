"use client";

import { useReducedMotion as useFramerReducedMotion } from "motion/react";

/**
 * Thin wrapper around Framer's hook so components have one import site.
 * Returns `true` when the user prefers reduced motion — components should
 * then render final values instantly (no tween) instead of animating.
 */
export function useReducedMotion(): boolean {
  return useFramerReducedMotion() ?? false;
}
