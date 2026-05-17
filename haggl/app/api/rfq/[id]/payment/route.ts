import { NextRequest, NextResponse } from "next/server";
import { tables } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: "RFQ ID required" }, { status: 400 });
    }

    // Find the awarded supplier for this RFQ (status = 'agreed')
    const { data: rfqSupplier, error } = await tables.rfq_suppliers
      .select("id, supplier_id, metadata, status, notes")
      .eq("rfq_id", id)
      .eq("status", "agreed")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!rfqSupplier) {
      return NextResponse.json({
        rfq_id: id,
        awarded: false,
        payment_id: null,
        status: "none",
        payment_link: null,
        payment_link_id: null,
        savings_tracked: 0,
      });
    }

    const metadata = (rfqSupplier.metadata as Record<string, any>) || {};

    return NextResponse.json({
      rfq_id: id,
      awarded: true,
      supplier_id: rfqSupplier.supplier_id,
      payment_id: metadata.sponsor_sponge_payment_id || null,
      status: metadata.sponsor_sponge_status || "pending",
      payment_link: metadata.sponsor_stripe_payment_link || null,
      payment_link_id: metadata.sponsor_stripe_payment_link_id || null,
      savings_tracked: metadata.sponsor_savings_tracked || 0,
      payment_timestamp: metadata.sponsor_payment_timestamp || null,
      trade_documents: metadata.trade_documents || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
