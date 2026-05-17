"use client";

/**
 * Mock auth — UI only. Persists a fake session in a cookie so the
 * server `getSession()` can gate routes. Swap this module for real
 * Supabase (`@supabase/ssr`) later; nothing else changes.
 */

import {
  SESSION_COOKIE,
  ONBOARDED_COOKIE,
  type MockSession,
} from "./constants";

export { SESSION_COOKIE, type MockSession };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

function setCookie(name: string, value: string, days = 7) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

export function signIn(session: MockSession): void {
  setCookie(SESSION_COOKIE, JSON.stringify(session));
}

export function signInWithGoogle(): void {
  signIn({ email: "marcus@allenimports.co", provider: "google" });
}

export function markOnboarded(): void {
  setCookie(ONBOARDED_COOKIE, "1");
}

export function signOut(): void {
  clearCookie(SESSION_COOKIE);
  clearCookie(ONBOARDED_COOKIE);
}
