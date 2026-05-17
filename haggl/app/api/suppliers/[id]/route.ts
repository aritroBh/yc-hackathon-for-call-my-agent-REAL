import { NextRequest, NextResponse } from "next/server";
import { tables } from "@/lib/db";
import { SupplierUpdateSchema } from "@/lib/validators";
import type { SupplierRow } from "@/types/database";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;
    const { data, error } = await tables.suppliers.select("*").eq("id", id).single();
    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
      }
      throw error;
    }
    return NextResponse.json(data as SupplierRow);
  } catch (err: unknown) {
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
    const parsed = SupplierUpdateSchema.parse(body);
    const { data, error } = await tables.suppliers.update(parsed).eq("id", id).select().single();
    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
      }
      throw error;
    }
    return NextResponse.json(data as SupplierRow);
  } catch (err: unknown) {
    if (err instanceof Error && "issues" in err) {
      return NextResponse.json({ error: "Validation failed", details: (err as any).issues }, { status: 400 });
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
    const { error } = await tables.suppliers.delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
