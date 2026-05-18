/**
 * Minimal Sponge client for the web app's "sign the deal" flow.
 *
 * Sponge is x402 USDC micropayments. We use the same self-payment pattern
 * as the haggl backend: an x402/fetch against our own procurement-record
 * endpoint writes the deal into Sponge's on-chain transaction ledger.
 *
 * When SPONGE_API_KEY is absent (or Sponge is unreachable) we still return
 * a deterministic payment id so the dashboard flow always completes —
 * the receipt email then makes the "it paid" moment real.
 */

const BASE = "https://api.wallet.paysponge.com/api";
const API_KEY = process.env.SPONGE_API_KEY;
const SPONGE_VERSION = "0.2.1";

export interface SpongePayment {
  paymentId: string;
  status: "paid" | "recorded" | "simulated";
}

export async function recordDealInSponge(params: {
  rfqId: string;
  supplierName: string;
  amount: number;
  currency: string;
}): Promise<SpongePayment> {
  const fallbackId = `sp_deal_${params.rfqId.slice(0, 8)}`;

  if (!API_KEY) {
    console.warn("[sponge] SPONGE_API_KEY not set — recording deal locally");
    return { paymentId: fallbackId, status: "simulated" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const res = await fetch(`${BASE}/x402/fetch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Sponge-Version": SPONGE_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: `${appUrl}/api/procurement/record`,
        method: "POST",
        preferred_chain: "base",
        body: JSON.stringify({
          rfq_id: params.rfqId,
          supplier: params.supplierName,
          amount: params.amount,
          currency: params.currency,
        }),
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = (await res.json().catch(() => ({}))) as {
      payment_made?: boolean;
    };
    console.log("[sponge] deal recorded, payment_made:", data.payment_made);
    return {
      paymentId: fallbackId,
      status: data.payment_made ? "paid" : "recorded",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[sponge] x402 fetch failed, recording locally:", msg);
    return { paymentId: fallbackId, status: "simulated" };
  }
}
