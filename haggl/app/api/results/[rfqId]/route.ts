import { NextRequest, NextResponse } from "next/server";
import { getRFQById, listCallsByRFQ, getSupplierById } from "@/lib/db";
import type { CallRow } from "@/types/database";
import type { AggregatedResults, RankingScore } from "@/types/index";

export async function GET(
  _request: NextRequest,
  { params }: { params: { rfqId: string } },
) {
  try {
    const { rfqId } = params;

    const rfq = await getRFQById(rfqId);
    if (!rfq) {
      return NextResponse.json({ error: "RFQ not found" }, { status: 404 });
    }

    const calls = await listCallsByRFQ(rfqId);

    const successful = calls.filter((c) => c.status === "completed" && !c.error_message);
    const failed = calls.filter(
      (c) => c.status === "failed" || c.error_message != null,
    );

    const supplierIds = new Set(calls.map((c) => c.supplier_id));
    const respondedIds = new Set(successful.map((c) => c.supplier_id));

    let bestPrice: number | null = null;
    let bestPriceSupplier: string | null = null;
    const quotedPrices: number[] = [];

    const rankedSuppliers: RankingScore[] = [];

    for (const call of successful) {
      if (!call.result) continue;
      const result = call.result as Record<string, unknown>;
      const quotedPrice = result.quoted_price as number | undefined;

      if (quotedPrice != null) {
        quotedPrices.push(quotedPrice);
        if (bestPrice === null || quotedPrice < bestPrice) {
          bestPrice = quotedPrice;
          bestPriceSupplier = result.supplier_name as string || call.supplier_id;
        }
      }

      const supplier = await getSupplierById(call.supplier_id);

      rankedSuppliers.push({
        supplier_id: call.supplier_id,
        supplier_name: supplier?.name || "Unknown",
        composite_score: (result.composite_score as number) ?? 0,
        price_score: (result.price_score as number) ?? 0,
        terms_score: (result.terms_score as number) ?? 0,
        reliability_score: (result.reliability_score as number) ?? 0,
        communication_score: (result.communication_score as number) ?? 0,
        confidence_score: (result.confidence_score as number) ?? 0,
        breakdown: (result.breakdown as Record<string, number>) ?? {},
      });
    }

    rankedSuppliers.sort((a, b) => b.composite_score - a.composite_score);

    const averageQuotedPrice =
      quotedPrices.length > 0
        ? quotedPrices.reduce((a, b) => a + b, 0) / quotedPrices.length
        : null;

    const aggregated: AggregatedResults = {
      rfq_id: rfqId,
      rfq_title: rfq.title,
      total_calls: calls.length,
      successful_calls: successful.length,
      failed_calls: failed.length,
      suppliers_contacted: supplierIds.size,
      suppliers_responded: respondedIds.size,
      best_price: bestPrice,
      best_price_supplier: bestPriceSupplier,
      average_quoted_price: averageQuotedPrice,
      ranked_suppliers: rankedSuppliers,
      created_at: new Date().toISOString(),
    };

    return NextResponse.json(aggregated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
