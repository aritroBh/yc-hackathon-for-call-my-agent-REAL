/**
 * Directive-free shared constants/types so BOTH the server session
 * reader (`index.ts`) and the client mock (`mock-auth.ts`) can use them.
 * Importing runtime values from a "use client" module into a Server
 * Component yields undefined — keep these here.
 */

export const SESSION_COOKIE = "atlas_session";
export const ONBOARDED_COOKIE = "atlas_onboarded";

export interface MockSession {
  email: string;
  provider: "email" | "google";
}
