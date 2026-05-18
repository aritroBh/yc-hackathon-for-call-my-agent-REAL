/**
 * AgentMail receipt sender for the web app's "sign the deal" flow.
 *
 * Sends the buyer a payment receipt the instant Sponge settles the deal.
 * Returns the recipient so the UI can show "receipt sent to <email>".
 * Degrades quietly (returns sent:false) when AgentMail isn't configured —
 * the dashboard still confirms the payment.
 */

const BASE = "https://api.agentmail.to/v0";
const API_KEY = process.env.AGENTMAIL_API_KEY;
const INBOX = process.env.AGENTMAIL_INBOX;
const BUYER_EMAIL =
  process.env.BUYER_NOTIFICATION_EMAIL ||
  process.env.BUYER_EMAIL ||
  "djnintang@gmail.com";

export async function sendReceiptEmail(params: {
  supplierName: string;
  partName: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  leadDays: number | null;
  rfqTitle: string;
  paymentId: string;
}): Promise<{ sent: boolean; recipient: string }> {
  const total = params.unitPrice * params.quantity;
  const fmt = (n: number) =>
    `${params.currency === "USD" ? "$" : ""}${n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const subject = `HAGGL: Payment confirmed — ${params.supplierName} (${params.rfqTitle})`;

  const html = `
    <div style="font-family:'Inter',system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e5e7eb;border-radius:8px;background:#ffffff;">
      <div style="background:linear-gradient(135deg,#1e1b4b,#312e81);padding:24px 20px;border-radius:6px;text-align:center;margin-bottom:22px;">
        <h1 style="color:#fff;margin:0;font-size:24px;font-weight:bold;letter-spacing:-0.025em;">HAGGL</h1>
        <p style="color:#c7d2fe;margin:6px 0 0 0;font-size:14px;">Payment Receipt</p>
      </div>

      <div style="background:rgba(16,185,129,0.1);border-left:4px solid #10b981;padding:14px 16px;margin:0 0 22px 0;border-radius:4px;">
        <h3 style="color:#10b981;margin:0;font-size:16px;">Deal signed &amp; paid</h3>
        <p style="margin:6px 0 0 0;color:#4b5563;font-size:14px;">Your agent locked in the best deal and Sponge settled the payment autonomously.</p>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#6b7280;">Supplier</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#111827;">${params.supplierName}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Item</td><td style="padding:6px 0;text-align:right;color:#111827;">${params.partName}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Quantity</td><td style="padding:6px 0;text-align:right;color:#111827;">${params.quantity.toLocaleString("en-US")} units</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Unit price</td><td style="padding:6px 0;text-align:right;color:#111827;">${fmt(params.unitPrice)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Lead time</td><td style="padding:6px 0;text-align:right;color:#111827;">${params.leadDays != null ? `${params.leadDays} days` : "TBD"}</td></tr>
        <tr style="border-top:2px solid #e5e7eb;"><td style="padding:10px 0;color:#111827;font-weight:bold;">Total paid</td><td style="padding:10px 0;text-align:right;font-weight:bold;color:#10b981;font-size:16px;">${fmt(total)}</td></tr>
      </table>

      <p style="color:#9ca3af;font-size:12px;margin:22px 0 0 0;">Sponge payment ref: <strong>${params.paymentId}</strong></p>
      <hr style="border:0;border-top:1px solid #e5e7eb;margin:20px 0;" />
      <p style="color:#9ca3af;font-size:12px;text-align:center;margin:0;">Sent via HAGGL Autonomous Commerce Network</p>
    </div>
  `;

  const text = `HAGGL Payment Receipt
Supplier: ${params.supplierName}
Item: ${params.partName} (${params.quantity} units)
Unit price: ${fmt(params.unitPrice)}
Total paid: ${fmt(total)}
Sponge ref: ${params.paymentId}`;

  if (!API_KEY || !INBOX) {
    console.warn(
      "[agentmail] AGENTMAIL_API_KEY or AGENTMAIL_INBOX not set — receipt email skipped",
    );
    return { sent: false, recipient: BUYER_EMAIL };
  }

  try {
    const res = await fetch(`${BASE}/inboxes/${INBOX}/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: BUYER_EMAIL, subject, text, html }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`AgentMail responded ${res.status}`);
    console.log(`[agentmail] receipt sent to buyer: ${BUYER_EMAIL}`);
    return { sent: true, recipient: BUYER_EMAIL };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[agentmail] receipt send failed:", msg);
    return { sent: false, recipient: BUYER_EMAIL };
  }
}
