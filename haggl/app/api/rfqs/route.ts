import { NextRequest, NextResponse } from "next/server";
import { tables } from "@/lib/db";
import { resolveOrganizationId } from "@/lib/demo";
import { RFQCreateSchema } from "@/lib/validators";
import type { RFQRow } from "@/types/database";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = resolveOrganizationId(searchParams.get("organization_id"));
    if (!organizationId) {
      return NextResponse.json({ error: "organization_id is required" }, { status: 400 });
    }
    const { data, error } = await tables.rfqs
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json(data as RFQRow[]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RFQCreateSchema.parse({
      ...body,
      organization_id: resolveOrganizationId(body.organization_id),
    });
    const { data, error } = await tables.rfqs.insert(parsed).select().single();
    if (error) throw error;
    return NextResponse.json(data as RFQRow, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && "issues" in err) {
      return NextResponse.json({ error: "Validation failed", details: (err as any).issues }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
