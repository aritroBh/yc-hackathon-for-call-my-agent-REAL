import { NextResponse } from "next/server";
import { recordDealInSponge } from "@/lib/sponsors/sponge";
import { sendReceiptEmail } from "@/lib/sponsors/agentmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Body sent by the store's `signDeal` action (SignDealInput). */
interface SignBody {
  supplierName?: unknown;
  amount?: unknown;
  currency?: unknown;
  rfqId?: unknown;
  rfqTitle?: unknown;
  partName?: unknown;
  quantity?: unknown;
  leadDays?: unknown;
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

export async function POST(request: Request) {
  let body: SignBody;
  try {
    body = (await request.json()) as SignBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supplierName = String(body.supplierName ?? "").trim();
  const amount = asNumber(body.amount);
  if (!supplierName || amount <= 0) {
    return NextResponse.json(
      { error: "supplierName and a positive amount are required" },
      { status: 400 },
    );
  }

  const currency = String(body.currency ?? "USD") || "USD";
  const rfqId = String(body.rfqId ?? "rfq");
  const rfqTitle = String(body.rfqTitle ?? "your order");
  const partName = String(body.partName ?? rfqTitle);
  const quantity = Math.max(1, Math.round(asNumber(body.quantity, 1)));
  const leadDays =
    body.leadDays == null ? null : Math.round(asNumber(body.leadDays));

  // 1. Sponge autonomously settles the deal.
  const payment = await recordDealInSponge({
    rfqId,
    supplierName,
    amount,
    currency,
  });

  // 2. Receipt email lands in the buyer's inbox.
  const receipt = await sendReceiptEmail({
    supplierName,
    partName,
    quantity,
    unitPrice: amount,
    currency,
    leadDays,
    rfqTitle,
    paymentId: payment.paymentId,
  });

  return NextResponse.json({
    paymentId: payment.paymentId,
    status: payment.status,
    receiptEmail: receipt.recipient,
    emailSent: receipt.sent,
  });
}
