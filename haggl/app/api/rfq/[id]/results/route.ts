import { NextRequest, NextResponse } from "next/server";
import { getRFQById, listCallsByRFQ, getSupplierById, getDecryptedFloorPrice } from "@/lib/db";
import {
  extractCallData,
  buildTranscriptText,
  type CallExtraction,
} from "@/lib/aggregator";
import {
  scoreSupplier,
  buildRankingExplanations,
  type ScoringContext,
  type ScoreWeights,
  type ScoredSupplier,
  type RankingExplanation,
} from "@/lib/scoring";
import type { CallRow } from "@/types/database";

export interface AggregatedResultsResponse {
  rfq_id: string;
  rfq_title: string;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  total_cost_millicents: number;
  suppliers_contacted: number;
  suppliers_responded: number;
  best_price: number | null;
  best_price_supplier: string | null;
  best_price_supplier_id: string | null;
  average_quoted_price: number | null;
  ranked_suppliers: ScoredSupplier[];
  explanations: RankingExplanation[];
  recommended_supplier: RankingExplanation | null;
  weights_used: ScoreWeights;
  target_price: number | null;
  floor_price: number | null;
  created_at: string;
}

function buildRfqContext(call: CallRow, rfqTitle: string, itemsStr: string): string {
  return [
    "RFQ: " + rfqTitle,
    "Items: " + itemsStr,
    "Supplier ID: " + call.supplier_id,
  ].join(" | ");
}

function formatItemsForContext(items: any[] | null | undefined): string {
  if (!items || !Array.isArray(items) || items.length === 0) return "Not specified";
  return items
    .map((i: any) => i.quantity + " " + (i.unit || "units") + ' of "' + (i.description || i.sku || "item") + '"')
    .join("; ");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;

    const rfq = await getRFQById(id);
    if (!rfq) {
      return NextResponse.json({ error: "RFQ not found" }, { status: 404 });
    }

    const calls = await listCallsByRFQ(id);

    const successful = calls.filter(
      (c) => c.status === "completed" && !c.error_message,
    );
    const failed = calls.filter(
      (c) => c.status === "failed" || c.error_message != null,
    );

    const emptyResponse: AggregatedResultsResponse = {
      rfq_id: id,
      rfq_title: rfq.title,
      total_calls: calls.length,
      successful_calls: 0,
      failed_calls: failed.length,
      total_cost_millicents: calls.reduce((acc, c) => acc + (c.cost_millicents || 0), 0),
      suppliers_contacted: new Set(calls.map((c) => c.supplier_id)).size,
      suppliers_responded: 0,
      best_price: null,
      best_price_supplier: null,
      best_price_supplier_id: null,
      average_quoted_price: null,
      ranked_suppliers: [],
      explanations: [],
      recommended_supplier: null,
      weights_used: { price: 0.40, lead_time: 0.25, communication: 0.15, reliability: 0.20 },
      target_price: rfq.target_price,
      floor_price: null,
      created_at: new Date().toISOString(),
    };

    if (successful.length === 0) {
      return NextResponse.json(emptyResponse);
    }

    const itemsStr = formatItemsForContext(rfq.items);
    const floorPrice = await getDecryptedFloorPrice(id);

    const ctx: ScoringContext = {
      targetPrice: rfq.target_price,
      floorPrice,
      targetLeadDays: null,
    };

    const extractionPromises = successful.map(async (call) => {
      const supplier = await getSupplierById(call.supplier_id);
      const supplierName = supplier?.name || "Unknown Supplier";
      const transcriptText = buildTranscriptText(call.transcript || []);
      const rfqContext = buildRfqContext(call, rfq.title, itemsStr);

      const result = await extractCallData({
        callId: call.id,
        supplierId: call.supplier_id,
        supplierName,
        transcriptText,
        rfqContext,
      });

      // Inject cost and duration into the extraction
      (result as any).call_cost_millicents = call.cost_millicents;
      (result as any).duration_seconds = call.duration_seconds;

      return result;
    });

    const extractions = await Promise.all(extractionPromises);

    const validExtractions = extractions.filter(
      (e) => !e.error && e.quoted_price != null,
    );

    const prices = validExtractions
      .map((e) => e.quoted_price)
      .filter((p): p is number => p != null);

    const bestPrice = prices.length > 0 ? Math.min(...prices) : null;
    const avgPrice = prices.length > 0
      ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100
      : null;

    const bestPriceExtraction = bestPrice != null
      ? validExtractions.find((e) => e.quoted_price === bestPrice)
      : null;

    const seenSuppliers = new Map<string, CallExtraction>();
    for (const e of extractions) {
      if (e.error && !seenSuppliers.has(e.supplier_id)) {
        seenSuppliers.set(e.supplier_id, e);
        continue;
      }
      if (e.quoted_price == null) continue;
      const existing = seenSuppliers.get(e.supplier_id);
      if (!existing || existing.quoted_price == null) {
        seenSuppliers.set(e.supplier_id, e);
      }
    }

    const scored: ScoredSupplier[] = [];
    seenSuppliers.forEach((extraction) => {
      const s = scoreSupplier(extraction.supplier_id, extraction.supplier_name, extraction, ctx);
      scored.push(s);
    });

    scored.sort((a, b) => b.composite_score - a.composite_score);

    const explanations = buildRankingExplanations(scored, ctx.weights || { price: 0.40, lead_time: 0.25, communication: 0.15, reliability: 0.20 });

    const recommended = explanations.find((e) => e.is_recommended) || null;

    const response: AggregatedResultsResponse = {
      rfq_id: id,
      rfq_title: rfq.title,
      total_calls: calls.length,
      successful_calls: successful.length,
      failed_calls: failed.length,
      total_cost_millicents: calls.reduce((acc, c) => acc + (c.cost_millicents || 0), 0),
      suppliers_contacted: new Set(calls.map((c) => c.supplier_id)).size,
      suppliers_responded: seenSuppliers.size,
      best_price: bestPrice,
      best_price_supplier: bestPriceExtraction?.supplier_name || null,
      best_price_supplier_id: bestPriceExtraction?.supplier_id || null,
      average_quoted_price: avgPrice,
      ranked_suppliers: scored,
      explanations,
      recommended_supplier: recommended,
      weights_used: ctx.weights || { price: 0.40, lead_time: 0.25, communication: 0.15, reliability: 0.20 },
      target_price: rfq.target_price,
      floor_price: floorPrice,
      created_at: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
