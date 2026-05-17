import axios from "axios";

const BASE = "https://api.agentmail.to/v0";
const API_KEY = process.env.AGENTMAIL_API_KEY;
const INBOX = process.env.AGENTMAIL_INBOX;
const BUYER_EMAIL = process.env.BUYER_NOTIFICATION_EMAIL || process.env.BUYER_EMAIL || "procurement@haggl.ai";

export async function sendPostCallEmail(params: {
  toEmail: string;
  toName: string;
  partName: string;
  quantity: number;
  quotedPrice: number | null;
  leadTimeDays: number | null;
  outcome: string;
  callId: string;
  rfqId: string;
  compositeScore?: number;
  rank?: number;
}): Promise<void> {
  if (!params.toEmail) return;

  const subject = `HAGGL: Quote received from ${params.toName} — ${params.outcome.toUpperCase()}`;
  
  // Custom templates based on outcome
  let outcomeHTML = "";
  if (params.outcome === "declined") {
    outcomeHTML = `
      <div style="background: rgba(239, 68, 68, 0.1); border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h4 style="color: #ef4444; margin: 0 0 5px 0;">Negotiation Declined</h4>
        <p style="margin: 0; color: #4b5563; font-size: 14px;">This supplier was unable to meet your requirements.</p>
      </div>
    `;
  } else if (params.outcome === "agreed" || params.outcome === "quoted") {
    const scoreText = params.compositeScore ? `${params.compositeScore.toFixed(1)}/100` : "Pending";
    const rankText = params.rank ? `#${params.rank}` : "Pending";
    outcomeHTML = `
      <div style="background: rgba(16, 185, 129, 0.1); border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h4 style="color: #10b981; margin: 0 0 10px 0;">Negotiation Successful</h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Quoted Price:</td>
            <td style="padding: 4px 0; font-weight: bold; color: #111827;">$${params.quotedPrice?.toFixed(2)}/unit</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Lead Time:</td>
            <td style="padding: 4px 0; font-weight: bold; color: #111827;">${params.leadTimeDays || "TBD"} days</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">Composite Score:</td>
            <td style="padding: 4px 0; font-weight: bold; color: #10b981;">${scoreText}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #6b7280;">HAGGL Rank:</td>
            <td style="padding: 4px 0; font-weight: bold; color: #6366f1;">${rankText}</td>
          </tr>
        </table>
      </div>
    `;
  } else {
    outcomeHTML = `
      <div style="background: rgba(245, 158, 11, 0.1); border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h4 style="color: #f59e0b; margin: 0 0 5px 0;">No Answer / Follow-up</h4>
        <p style="margin: 0; color: #4b5563; font-size: 14px;">We are currently waiting for a follow-up or final confirmation from the supplier.</p>
      </div>
    `;
  }

  const resultsUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/rfq/${params.rfqId}/results`;

  const html = `
    <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #4f46e5, #6366f1); padding: 20px; border-radius: 6px; text-align: center; margin-bottom: 20px;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: -0.025em;">HAGGL</h1>
        <p style="color: #e0e7ff; margin: 5px 0 0 0; font-size: 14px;">Autonomous Negotiation Intelligence</p>
      </div>
      
      <p style="color: #374151; font-size: 16px; line-height: 1.5;">Hi <strong>${params.toName}</strong>,</p>
      <p style="color: #4b5563; font-size: 15px; line-height: 1.5;">
        Thank you for speaking with our autonomous procurement agent regarding <strong>${params.partName}</strong> (Quantity: ${params.quantity} units).
      </p>

      ${outcomeHTML}

      <div style="text-align: center; margin: 30px 0 20px 0;">
        <a href="${resultsUrl}" style="background: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">View Full Results</a>
      </div>

      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0 20px 0;" />
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
        Sent via HAGGL Autonomous Commerce Network • Verified Agentic Delivery
      </p>
    </div>
  `;

  const text = `HAGGL: Negotiation completed with ${params.toName}.\nOutcome: ${params.outcome}\nPart: ${params.partName}\nQuoted Price: $${params.quotedPrice || "TBD"}\nLead Time: ${params.leadTimeDays || "TBD"} days\nFull results: ${resultsUrl}`;

  if (!API_KEY || !INBOX) {
    console.log(`[agentmail] MOCK email dispatched to supplier ${params.toEmail}: ${subject}`);
    return;
  }

  try {
    await axios.post(
      `${BASE}/inboxes/${INBOX}/messages/send`,
      { to: [{ address: params.toEmail, name: params.toName }], subject, text, html },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      },
    );
    console.log(`[agentmail] email successfully sent to supplier: ${params.toEmail}`);
  } catch (err: any) {
    console.warn("[agentmail] send to supplier failed:", err.message);
  }
}

export async function sendBuyerPostCallEmail(params: {
  rfqTitle: string;
  rfqId: string;
  partName: string;
  quantity: number;
  suppliers: {
    name: string;
    quotedPrice: number | null;
    leadTimeDays: number | null;
    outcome: string;
    compositeScore?: number;
    rank?: number;
  }[];
}): Promise<void> {
  const subject = `HAGGL: Negotiation complete — ${params.rfqTitle}`;

  // Sort suppliers by rank or score
  const sorted = [...params.suppliers].sort((a, b) => (b.compositeScore || 0) - (a.compositeScore || 0));

  let suppliersRows = "";
  sorted.forEach((s, idx) => {
    const isRecommended = idx === 0 && s.outcome === "quoted";
    const bgStyle = isRecommended ? "background-color: rgba(16, 185, 129, 0.08);" : "";
    const scoreVal = s.compositeScore ? s.compositeScore.toFixed(1) : "N/A";
    const priceVal = s.quotedPrice ? `$${s.quotedPrice.toFixed(2)}` : "Declined";
    const leadVal = s.leadTimeDays ? `${s.leadTimeDays} days` : "TBD";
    
    suppliersRows += `
      <tr style="${bgStyle} border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 12px 10px; font-weight: bold; color: #111827;">
          ${s.name} ${isRecommended ? '<span style="background: #10b981; color: #ffffff; font-size: 10px; padding: 2px 6px; border-radius: 12px; margin-left: 6px;">RECOMMENDED</span>' : ""}
        </td>
        <td style="padding: 12px 10px; color: #374151;">${priceVal}</td>
        <td style="padding: 12px 10px; color: #374151;">${leadVal}</td>
        <td style="padding: 12px 10px; font-weight: bold; color: #10b981;">${scoreVal}</td>
        <td style="padding: 12px 10px; color: #6b7280; font-size: 13px;">${s.outcome.toUpperCase()}</td>
      </tr>
    `;
  });

  const resultsUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/rfq/${params.rfqId}/results`;

  const html = `
    <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 650px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #1e1b4b, #312e81); padding: 25px 20px; border-radius: 6px; text-align: center; margin-bottom: 25px;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: -0.025em;">HAGGL PROCUREMENT MONITOR</h1>
        <p style="color: #c7d2fe; margin: 6px 0 0 0; font-size: 14px;">Negotiation Sequence Finished for: <strong>${params.rfqTitle}</strong></p>
      </div>

      <p style="color: #374151; font-size: 15px; line-height: 1.5;">
        Our autonomous negotiation dispatchers have successfully concluded all supplier dialogues for RFQ: <strong>${params.rfqTitle}</strong>.
      </p>

      <div style="margin: 25px 0;">
        <h3 style="color: #1f2937; margin: 0 0 12px 0; font-size: 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px;">Supplier Ranking Table</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; text-align: left;">
          <thead>
            <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
              <th style="padding: 10px; color: #4b5563; font-weight: 600;">Supplier</th>
              <th style="padding: 10px; color: #4b5563; font-weight: 600;">Price/Unit</th>
              <th style="padding: 10px; color: #4b5563; font-weight: 600;">Lead Time</th>
              <th style="padding: 10px; color: #4b5563; font-weight: 600;">Score</th>
              <th style="padding: 10px; color: #4b5563; font-weight: 600;">Outcome</th>
            </tr>
          </thead>
          <tbody>
            ${suppliersRows}
          </tbody>
        </table>
      </div>

      <div style="text-align: center; margin: 30px 0 20px 0;">
        <a href="${resultsUrl}" style="background: #6366f1; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">Award and Initiate Sponsor Payments</a>
      </div>

      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0 20px 0;" />
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
        This is an automated summary of active negotiation sequences managed by HAGGL.
      </p>
    </div>
  `;

  const text = `HAGGL: Negotiation complete for ${params.rfqTitle}. Ranked table of results at: ${resultsUrl}`;

  if (!API_KEY || !INBOX) {
    console.log(`[agentmail] MOCK email dispatched to buyer ${BUYER_EMAIL}: ${subject}`);
    return;
  }

  try {
    await axios.post(
      `${BASE}/inboxes/${INBOX}/messages/send`,
      { to: [{ address: BUYER_EMAIL, name: "HAGGL Buyer Account" }], subject, text, html },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      },
    );
    console.log(`[agentmail] email successfully sent to buyer: ${BUYER_EMAIL}`);
  } catch (err: any) {
    console.warn("[agentmail] send to buyer failed:", err.message);
  }
}

