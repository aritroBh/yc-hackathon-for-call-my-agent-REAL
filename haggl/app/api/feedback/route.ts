import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tables, getRFQById, getSupplierById, getDecryptedFloorPrice, listCallsByRFQ } from "@/lib/db";
import { FeedbackCreateSchema } from "@/lib/validators";
import { computeActualSavings } from "@/lib/patternExtraction";
import { initiatePayment, initiateSpongePayment } from "@/lib/sponsors/sponge";
import { createPaymentLink, recordSavingsEvent } from "@/lib/sponsors/stripe";
import type { FeedbackRow, CallRow } from "@/types/database";

const AwardSupplierSchema = z.object({
  supplier_id: z.string().uuid(),
  notes: z.string().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "award") {
      return handleAward(request);
    }

    const body = await request.json();
    const parsed = FeedbackCreateSchema.parse(body);

    const { data, error } = await tables.feedback.insert(parsed).select().single();
    if (error) throw error;

    const saved = data as FeedbackRow;
    const savings = await computeCallSavings(parsed.call_id, parsed.rfq_id);

    return NextResponse.json({ feedback: saved, savings }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.issues }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rfqId = searchParams.get("rfq_id");
    const callId = searchParams.get("call_id");
    const supplierId = searchParams.get("supplier_id");
    const includeSavings = searchParams.get("include_savings") === "true";
    const action = searchParams.get("action");

    if (action === "savings" && rfqId) {
      return handleSavingsByRFQ(rfqId);
    }

    if (action === "savings" && callId) {
      const savings = await computeCallSavings(callId, "");
      return NextResponse.json(savings);
    }

    if (action === "patterns" && rfqId) {
      return handlePatternsByRFQ(rfqId);
    }

    if (supplierId) {
      const { data } = await tables.feedback
        .select("*")
        .eq("supplier_id", supplierId)
        .order("created_at", { ascending: false });
      return NextResponse.json(data as FeedbackRow[]);
    }

    if (rfqId) {
      const { data } = await tables.feedback
        .select("*")
        .eq("rfq_id", rfqId)
        .order("created_at", { ascending: false });
      const results = (data as FeedbackRow[]) || [];

      if (includeSavings) {
        const withSavings = await Promise.all(
          results.map(async (f) => {
            const s = await computeCallSavings(f.call_id, f.rfq_id);
            return { ...f, savings: s };
          }),
        );
        return NextResponse.json(withSavings);
      }

      return NextResponse.json(results);
    }

    if (callId) {
      const { data } = await tables.feedback
        .select("*")
        .eq("call_id", callId)
        .order("created_at", { ascending: false });
      return NextResponse.json((data as FeedbackRow[]) || []);
    }

    const { data } = await tables.feedback
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    return NextResponse.json((data as FeedbackRow[]) || []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Feedback ID required" }, { status: 400 });

    const { error } = await tables.feedback.delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleAward(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const parsed = AwardSupplierSchema.parse(body);

  const { data: rfqSupplier, error: findError } = await tables.rfq_suppliers
    .select("id, rfq_id, metadata")
    .eq("supplier_id", parsed.supplier_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) throw findError;
  if (!rfqSupplier) return NextResponse.json({ error: "Supplier not linked to any RFQ" }, { status: 404 });

  const rfq = await getRFQById(rfqSupplier.rfq_id);
  if (!rfq) return NextResponse.json({ error: "RFQ not found" }, { status: 404 });
  if (rfq.status === "awarded") return NextResponse.json({ error: "RFQ already awarded" }, { status: 409 });

  const calls = await listCallsByRFQ(rfq.id);
  const successfulCall = calls
    .filter((c) => c.supplier_id === parsed.supplier_id && c.status === "completed" && c.result)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  const floorPrice = await getDecryptedFloorPrice(rfq.id);
  const quotedPrice = successfulCall?.result
    ? ((successfulCall.result as Record<string, unknown>).quoted_price as number | undefined) ?? null
    : null;

  const savings = computeActualSavings(rfq.target_price, floorPrice, quotedPrice);

  const { error: updateError } = await tables.rfqs
    .update({
      status: "awarded" as const,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rfq.id);
  if (updateError) throw updateError;

  const supplier = await getSupplierById(parsed.supplier_id);
  if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  // 1. Trigger Sponge Autonomous Payment
  let spongePayment = null;
  if (quotedPrice && quotedPrice > 0) {
    try {
      spongePayment = await initiateSpongePayment({
        amount: quotedPrice,
        currency: rfq.currency || "USD",
        recipientName: supplier.name,
        recipientEmail: supplier.email || "supplier@example.com",
        memo: `HAGGL payment for RFQ: ${rfq.title}`,
        callId: successfulCall?.id || "manual-award",
      });
    } catch (err: any) {
      console.warn("[Award] Sponge payment initiation failed:", err.message);
    }
  }

  // 2. Trigger Stripe Payment Link & Savings Event
  let stripeLink = null;
  if (quotedPrice && quotedPrice > 0) {
    try {
      stripeLink = await createPaymentLink(quotedPrice, rfq.currency || "USD", {
        rfq_id: rfq.id,
        call_id: successfulCall?.id || "manual-award",
        supplier_id: supplier.id,
      });

      // Track savings in Stripe customer metadata
      if (rfq.target_price && quotedPrice < rfq.target_price) {
        const savingsAmount = rfq.target_price - quotedPrice;
        await recordSavingsEvent(rfq.id, savingsAmount);
      }
    } catch (err: any) {
      console.warn("[Award] Stripe link generation failed:", err.message);
    }
  }

  // 3. Save transactions in rfq_suppliers metadata
  const currentMetadata = (rfqSupplier.metadata as Record<string, unknown>) || {};
  const updatedMetadata = {
    ...currentMetadata,
    sponsor_sponge_payment_id: spongePayment?.payment_id || null,
    sponsor_sponge_status: spongePayment?.status || "failed",
    sponsor_stripe_payment_link: stripeLink?.url || null,
    sponsor_stripe_payment_link_id: stripeLink?.paymentLinkId || null,
    sponsor_savings_tracked: (rfq.target_price && quotedPrice) ? (rfq.target_price - quotedPrice) : 0,
    sponsor_payment_timestamp: new Date().toISOString()
  };

  const { error: linkError } = await tables.rfq_suppliers
    .update({
      notes: spongePayment 
        ? `Sponge payment ${spongePayment.payment_id}: ${spongePayment.status}. Stripe link: ${stripeLink?.url || 'N/A'}`
        : (parsed.notes || "Awarded"),
      status: "agreed",
      metadata: updatedMetadata,
      updated_at: new Date().toISOString()
    })
    .eq("id", rfqSupplier.id);
  if (linkError) throw linkError;

  return NextResponse.json({
    success: true,
    awarded_supplier_id: parsed.supplier_id,
    rfq_id: rfq.id,
    rfq_title: rfq.title,
    quoted_price: quotedPrice,
    target_price: rfq.target_price,
    floor_price: floorPrice,
    savings,
    sponsor_sponge_payment_id: spongePayment?.payment_id || null,
    sponsor_stripe_payment_link: stripeLink?.url || null,
  });
}

async function computeCallSavings(callId: string, rfqId: string) {
  if (!rfqId) {
    const { data: call } = await tables.calls
      .select("rfq_id")
      .eq("id", callId)
      .single();
    if (call) rfqId = (call as CallRow).rfq_id;
  }

  const rfq = rfqId ? await getRFQById(rfqId) : null;
  if (!rfq) return null;

  const { data: call } = await tables.calls
    .select("result")
    .eq("id", callId)
    .single();
  if (!call) return null;

  const result = (call as CallRow).result as Record<string, unknown> | null;
  const quotedPrice = result ? (result.quoted_price as number | undefined) ?? null : null;
  const floorPrice = await getDecryptedFloorPrice(rfq.id);

  return computeActualSavings(rfq.target_price, floorPrice, quotedPrice);
}

async function handleSavingsByRFQ(rfqId: string) {
  const rfq = await getRFQById(rfqId);
  if (!rfq) return NextResponse.json({ error: "RFQ not found" }, { status: 404 });

  const calls = await listCallsByRFQ(rfqId);
  const floorPrice = await getDecryptedFloorPrice(rfqId);

  const completedCalls = calls.filter(
    (c) => c.status === "completed" && c.result && !c.error_message,
  );

  const callSavings = completedCalls.map((c) => {
    const result = c.result as Record<string, unknown> | null;
    const quotedPrice = result ? (result.quoted_price as number | undefined) ?? null : null;
    const savings = computeActualSavings(rfq.target_price, floorPrice, quotedPrice);
    return {
      call_id: c.id,
      supplier_id: c.supplier_id,
      quoted_price: quotedPrice,
      ...savings,
    };
  });

  const totalSavingsVsTarget = callSavings.reduce(
    (sum, c) => sum + (c.savings_vs_target ?? 0),
    0,
  );

  return NextResponse.json({
    rfq_id: rfqId,
    rfq_title: rfq.title,
    target_price: rfq.target_price,
    floor_price: floorPrice,
    total_savings_vs_target: totalSavingsVsTarget,
    award_candidate: callSavings.length > 0,
    call_savings: callSavings,
  });
}

async function handlePatternsByRFQ(rfqId: string) {
  const calls = await listCallsByRFQ(rfqId);
  const completedCalls = calls.filter((c) => c.status === "completed");

  const patternSummaries = completedCalls.map((c) => {
    const result = c.result as Record<string, unknown> | null;
    return {
      call_id: c.id,
      supplier_id: c.supplier_id,
      status: c.status,
      duration_seconds: c.duration_seconds,
      quoted_price: result ? (result.quoted_price as number | undefined) ?? null : null,
      confidence_score: result ? (result.confidence_score as number | undefined) ?? null : null,
    };
  });

  return NextResponse.json({
    rfq_id: rfqId,
    call_count: patternSummaries.length,
    calls: patternSummaries,
  });
}
