import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sponge x402 self-payment target. Sponge fetches this URL on behalf of the
 * agent; the request body carries the deal, and a 200 response makes the
 * micropayment settle and the deal land in Sponge's on-chain ledger.
 */
export async function POST(request: Request) {
  const deal = await request.json().catch(() => ({}));
  return NextResponse.json({ ok: true, recorded: true, deal });
}
