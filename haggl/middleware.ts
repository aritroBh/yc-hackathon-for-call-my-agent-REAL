import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const PUBLIC_ROUTES = [
  "/api/auth",
  "/api/health",
  "/api/calls/stream",
  // Vapi calls these from its cloud (custom-llm / custom-voice / server webhook)
  // — must be unauthenticated for the integration to work.
  "/api/vapi",
  // Demo data seeder (POC testing).
  "/api/demo",
  // Gemini Deep Research — called server-to-server by the standalone
  // `web/` frontend (the sole UI). haggl runs headless; this endpoint
  // is the supplier-discovery entry point for the sourcing plan.
  "/api/research",
  "/_next",
  "/favicon.ico",
  "/login",
  "/signup",
  "/design",
];

export const AUTH_CONFIG = {
  skipAuth: process.env.ENABLE_AUTH === "false" || process.env.DEMO_MODE === "true",
};

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + "/"));
}

export async function middleware(request: NextRequest): Promise<NextResponse | null> {
  if (AUTH_CONFIG.skipAuth) return null;
  if (isPublicRoute(request.nextUrl.pathname)) return null;

  const token = request.cookies.get("sb-access-token")?.value ||
                request.cookies.get("sb-refresh-token")?.value ||
                request.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-auth-token", token);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
