import { NextRequest, NextResponse } from "next/server";
import { tables } from "@/lib/db";
import type { CallRow } from "@/types/database";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rfqId = searchParams.get("rfq_id");
    const status = searchParams.get("status");
    const organizationId = searchParams.get("organization_id");

    let query = tables.calls.select("*");

    if (rfqId) {
      query = query.eq("rfq_id", rfqId);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (organizationId) {
      const { data: orgRfqs } = await tables.rfqs
        .select("id")
        .eq("organization_id", organizationId);
      if (orgRfqs && orgRfqs.length > 0) {
        const rfqIds = orgRfqs.map((r: any) => r.id);
        query = query.in("rfq_id", rfqIds);
      } else {
        return NextResponse.json([]);
      }
    }

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json(data as CallRow[]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
