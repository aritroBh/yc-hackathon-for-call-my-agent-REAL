import { NextResponse } from "next/server";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  uptime: number;
  timestamp: string;
  checks: {
    database: { status: string; latencyMs?: number };
    deepgram: { status: string };
    twilio: { status: string };
    anthropic: { status: string };
    queue: { status: string; size?: number };
    memory: { status: string; heapUsedMb?: number; heapTotalMb?: number };
  };
}

const startTime = Date.now();

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const checks: HealthStatus["checks"] = {
    database: { status: "unknown" },
    deepgram: { status: "unknown" },
    twilio: { status: "unknown" },
    anthropic: { status: "unknown" },
    queue: { status: "unknown" },
    memory: { status: "unknown" },
  };

  let overall: HealthStatus["status"] = "healthy";

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const dbStart = Date.now();
      const client = createClient(url, key);
      const { error } = await client.from("organizations").select("id", { count: "exact", head: true }).limit(1);
      checks.database = { status: error ? "error" : "ok", latencyMs: Date.now() - dbStart };
      if (error) { checks.database.status = "error"; overall = "degraded"; }
    } else {
      checks.database = { status: "not_configured" };
    }
  } catch (e) {
    checks.database = { status: "error" };
    overall = "degraded";
  }

  checks.deepgram = { status: process.env.DEEPGRAM_API_KEY ? "configured" : "not_configured" };
  checks.twilio = {
    status: process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN ? "configured" : "not_configured",
  };
  checks.anthropic = { status: process.env.ANTHROPIC_API_KEY ? "configured" : "not_configured" };

  const mem = process.memoryUsage();
  checks.memory = {
    status: mem.heapUsed / mem.heapTotal > 0.9 ? "warning" : "ok",
    heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
  };

  try {
    const { default: fs } = await import("fs");
    const queuePath = (process.env.HAGGL_DATA_DIR || "./data") + "/queue.json";
    if (fs.existsSync(queuePath)) {
      const raw = fs.readFileSync(queuePath, "utf-8");
      const data = JSON.parse(raw);
      checks.queue = { status: "ok", size: (data.entries || []).length };
    } else {
      checks.queue = { status: "empty" };
    }
  } catch {
    checks.queue = { status: "not_available" };
  }

  const status: HealthStatus = {
    status: overall,
    version: process.env.npm_package_version || "0.1.0",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks,
  };

  const httpStatus = overall === "healthy" ? 200 : overall === "degraded" ? 200 : 503;

  return NextResponse.json(status, { status: httpStatus });
}
