import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  ONBOARDED_COOKIE,
  type MockSession,
} from "./constants";

/**
 * Server-side session read — the single seam a real backend swaps into.
 * Replace the cookie read with a Supabase server client later.
 */
export async function getSession(): Promise<MockSession | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as MockSession;
  } catch {
    return null;
  }
}

export async function hasOnboarded(): Promise<boolean> {
  const store = await cookies();
  return store.get(ONBOARDED_COOKIE)?.value === "1";
}

export type { MockSession };
