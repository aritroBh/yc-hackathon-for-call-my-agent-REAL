import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tables, getRFQById, getSuppliersForRFQ, listCallsByRFQ } from "@/lib/db";
import { RFQUpdateSchema } from "@/lib/validators";
import type { RFQRow } from "@/types/database";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;

    const [rfq, suppliers, calls] = await Promise.all([
      getRFQById(id),
      getSuppliersForRFQ(id),
      listCallsByRFQ(id),
    ]);

    if (!rfq) {
      return NextResponse.json({ error: "RFQ not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...rfq,
      suppliers,
      calls,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;
    const body = await request.json();

    const existing = await getRFQById(id);
    if (!existing) {
      return NextResponse.json({ error: "RFQ not found" }, { status: 404 });
    }

    if (existing.status === "closed" || existing.status === "awarded" || existing.status === "cancelled") {
      return NextResponse.json(
        { error: `Cannot update RFQ in '${existing.status}' status` },
        { status: 422 },
      );
    }

    const parsed = RFQUpdateSchema.parse(body);

    if (parsed.status === "closed" || parsed.status === "awarded" || parsed.status === "cancelled") {
      const updated = { ...parsed, updated_at: new Date().toISOString() };
      const { data, error } = await tables.rfqs
        .update(updated)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json(data as RFQRow);
    }

    const { data, error } = await tables.rfqs
      .update(parsed)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data as RFQRow);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: err.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
            code: i.code,
          })),
        },
        { status: 400 },
      );
    }
    if (err instanceof Error && "code" in err) {
      const pgErr = err as unknown as { code: string; details?: string };
      if (pgErr.code === "23503") {
        return NextResponse.json(
          { error: "Cannot delete: RFQ has associated records", details: pgErr.details || "" },
          { status: 409 },
        );
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;

    const existing = await getRFQById(id);
    if (!existing) {
      return NextResponse.json({ error: "RFQ not found" }, { status: 404 });
    }

    if (existing.status === "negotiating" || existing.status === "awarded") {
      return NextResponse.json(
        {
          error: `Cannot delete RFQ in '${existing.status}' status. Cancel it first.`,
        },
        { status: 422 },
      );
    }

    const { error } = await tables.rfqs.delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Error && "code" in err) {
      const pgErr = err as unknown as { code: string; details?: string };
      if (pgErr.code === "23503") {
        return NextResponse.json(
          {
            error: "Cannot delete: RFQ has associated records",
            details: pgErr.details || "",
          },
          { status: 409 },
        );
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
