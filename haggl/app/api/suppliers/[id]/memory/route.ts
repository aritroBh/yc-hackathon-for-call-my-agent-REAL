import { NextRequest, NextResponse } from "next/server";
import { getSupplierById } from "@/lib/db";
import { getSupplierMemory } from "@/lib/sponsors/supermemory";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: "Supplier ID required" }, { status: 400 });
    }

    const supplier = await getSupplierById(id);
    if (!supplier) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }

    const metadata = supplier.metadata && typeof supplier.metadata === "object"
      ? (supplier.metadata as Record<string, unknown>)
      : null;
    const region = typeof metadata?.region === "string" ? metadata.region : "";

    const memory = await getSupplierMemory(supplier.name, region);

    return NextResponse.json({
      supplier_id: id,
      name: supplier.name,
      memory: memory || "No negotiation memories logged yet.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
