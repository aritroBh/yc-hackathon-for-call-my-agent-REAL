import { NextResponse, type NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";

export const PUBLIC_ROUTES = [
  "/api/auth",
  "/api/health",
  "/api/calls/stream",
  "/_next",
  "/favicon.ico",
  "/login",
  "/signup",
];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + "/"));
}

export async function authMiddleware(request: NextRequest): Promise<NextResponse | null> {
  if (isPublicRoute(request.nextUrl.pathname)) return null;

  const authHeader = request.headers.get("authorization");
  let token: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }

  const origin = request.headers.get("origin") || "";
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.TWILIO_WEBHOOK_BASE,
    "http://localhost:3000",
    "http://localhost:3001",
  ].filter(Boolean);

  if (allowedOrigins.some((o) => origin.startsWith(o || ""))) {
    token = request.cookies.get("sb-access-token")?.value || token;
  }

  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { user, error } = await verifyToken(token);

  if (error || !user) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", user.id);
  requestHeaders.set("x-user-email", user.email || "");

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const AUTH_CONFIG = {
  skipAuth: process.env.ENABLE_AUTH === "false",
};

export async function getAuthMiddleware(request: NextRequest): Promise<{ ok: boolean, userId?: string, organizationId?: string }> {
  if (AUTH_CONFIG.skipAuth) return { ok: true, organizationId: process.env.NEXT_PUBLIC_DEMO_ORG_ID };

  const authHeader = request.headers.get("authorization");
  let token: string | null = null;
  if (authHeader?.startsWith("Bearer ")) token = authHeader.slice(7);
  else token = request.cookies.get("sb-access-token")?.value || null;

  if (!token) return { ok: false };

  const { user, error } = await verifyToken(token);
  if (error || !user) return { ok: false };

  const { getOrganizationForUser } = await import("@/lib/auth");
  const orgId = await getOrganizationForUser(user.id);

  return { ok: true, userId: user.id, organizationId: orgId || undefined };
}
