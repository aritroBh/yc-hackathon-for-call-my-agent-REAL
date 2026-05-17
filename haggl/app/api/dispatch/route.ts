import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDispatcher } from "@/lib/dispatcher";
import { getCallWorker } from "@/workers/callWorker";
import { getCallQueue } from "@/lib/queue";

const DispatchBodySchema = z.object({
  rfq_id: z.string().uuid(),
  organization_id: z.string().uuid().optional(),
  max_concurrent: z.number().int().min(1).max(20).optional(),
  max_retries: z.number().int().min(0).max(5).optional(),
  calls_per_second: z.number().min(0.25).max(10).optional(),
  stagger_min_ms: z.number().int().min(100).max(10000).optional(),
  stagger_max_ms: z.number().int().min(100).max(10000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = DispatchBodySchema.parse(body);

    const { getAuthMiddleware, AUTH_CONFIG } = await import("@/lib/authMiddleware");
    const authResult = await getAuthMiddleware(request);
    
    if (!authResult.ok && !AUTH_CONFIG.skipAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { getRFQById } = await import("@/lib/db");
    const rfq = await getRFQById(parsed.rfq_id);
    if (!rfq) return NextResponse.json({ error: "RFQ not found" }, { status: 404 });

    const orgId = authResult.organizationId || rfq.organization_id;
    if (orgId !== rfq.organization_id && !AUTH_CONFIG.skipAuth) {
      return NextResponse.json({ error: "Forbidden: RFQ organization mismatch" }, { status: 403 });
    }

    const dispatcher = getDispatcher({
      maxConcurrent: parsed.max_concurrent,
      maxRetries: parsed.max_retries,
      callsPerSecond: parsed.calls_per_second,
      staggerMinMs: parsed.stagger_min_ms,
      staggerMaxMs: parsed.stagger_max_ms,
    });

    const worker = getCallWorker();
    if (!worker.isRunning) {
      worker.start();
    }

    const session = await dispatcher.dispatchRFQ(parsed.rfq_id, orgId);

    return NextResponse.json(
      {
        session: {
          rfqId: session.rfqId,
          status: session.status,
          totalSuppliers: session.totalSuppliers,
          startedAt: new Date(session.startedAt).toISOString(),
        },
        message: `Dispatching to ${session.totalSuppliers} suppliers`,
      },
      { status: 202 },
    );
  } catch (err: unknown) {
    if (err instanceof Error && "issues" in err) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: (err as z.ZodError).issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("already being dispatched")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rfqId = searchParams.get("rfq_id");

    const dispatcher = getDispatcher();
    const queue = getCallQueue();
    const worker = getCallWorker();

    if (rfqId) {
      const session = await dispatcher.getSession(rfqId);
      const entries = queue.getByRFQ(rfqId);
      return NextResponse.json({
        session: session || null,
        queue: entries,
        workerRunning: worker.isRunning,
        activeCalls: worker.activeCallCount,
      });
    }

    return NextResponse.json({
      activeSessions: dispatcher.getActiveSessions(),
      queueLength: queue.getQueueLength(),
      inFlight: queue.getInFlightCount(),
      pending: queue.getPendingCount(),
      workerRunning: worker.isRunning,
      activeCalls: worker.activeCallCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    let rfqId: string | null = new URL(request.url).searchParams.get("rfq_id");
    if (!rfqId) {
      try {
        const body = await request.json();
        rfqId = body.rfq_id || null;
      } catch {}
    }
    if (!rfqId) {
      return NextResponse.json({ error: "rfq_id required" }, { status: 400 });
    }

    const dispatcher = getDispatcher();
    dispatcher.cancelSession(rfqId);

    return NextResponse.json({ success: true, message: `Dispatch cancelled for ${rfqId}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
