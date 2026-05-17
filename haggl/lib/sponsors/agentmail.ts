import axios from "axios";

const BASE = "https://api.agentmail.to/v0";
const API_KEY = process.env.AGENTMAIL_API_KEY;
const INBOX = process.env.AGENTMAIL_INBOX;

export async function sendPostCallEmail(params: {
  toEmail: string;
  toName: string;
  partName: string;
  quantity: number;
  quotedPrice: number | null;
  leadTimeDays: number | null;
  outcome: string;
  callId: string;
}): Promise<void> {
  if (!API_KEY || !INBOX || !params.toEmail) return;
  const subject = params.quotedPrice
    ? `Quote Confirmation - ${params.partName} x ${params.quantity}`
    : `Follow-up - ${params.partName} Inquiry`;
  const text = params.quotedPrice
    ? `Hi ${params.toName},\n\nThank you for speaking with our procurement team today.\n\nConfirmed quote:\n- Part: ${params.partName}\n- Quantity: ${params.quantity} units\n- Price: $${params.quotedPrice}/unit\n- Lead time: ${params.leadTimeDays || "TBD"} days\n\nPlease reply to confirm these details.\n\nBest,\nHAGGL Procurement`
    : `Hi ${params.toName},\n\nThank you for your time today regarding ${params.partName} (${params.quantity} units).\n\nCould you send your best price quote at your earliest convenience?\n\nBest,\nHAGGL Procurement`;
  try {
    await axios.post(
      `${BASE}/inboxes/${INBOX}/messages`,
      { to: [{ email: params.toEmail, name: params.toName }], subject, text },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      },
    );
    console.log(`[agentmail] email sent to ${params.toEmail}`);
  } catch (err: any) {
    console.warn("[agentmail] send failed:", err.message);
  }
}
