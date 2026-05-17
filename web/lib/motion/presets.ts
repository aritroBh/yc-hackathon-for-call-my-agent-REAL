import type { Variants, Transition } from "motion/react";

/** Two shared easings — everything uses one of these. */
export const EASE = {
  standard: [0.22, 1, 0.36, 1] as const,
  soft: [0.4, 0, 0.2, 1] as const,
};

/** Durations — kept inside the 200–400ms band. */
export const DUR = {
  fast: 0.2,
  base: 0.28,
  slow: 0.36,
  xslow: 0.4,
};

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export const fadeUpTransition: Transition = {
  duration: DUR.base,
  ease: EASE.standard,
};

/** Onboarding step transitions. */
export const slideLeft: Variants = {
  initial: { opacity: 0, x: 40 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
};

export const slideLeftTransition: Transition = {
  duration: DUR.slow,
  ease: EASE.standard,
};

/** Staggered reveal — now-calling burst, ledger rows dealing in. */
export const staggerParent: Variants = {
  animate: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

export const staggerChild: Variants = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
};

export const staggerChildTransition: Transition = {
  duration: DUR.slow,
  ease: EASE.standard,
};

/** Chat dock collapse/expand. */
export const chatDockWidth = { collapsed: 64, expanded: 448 };

export const chatDockTransition: Transition = {
  duration: DUR.slow,
  ease: EASE.soft,
};
