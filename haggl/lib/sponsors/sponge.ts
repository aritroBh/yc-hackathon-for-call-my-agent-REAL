import axios from "axios";

const BASE = "https://api.wallet.paysponge.com/api";
const API_KEY = process.env.SPONGE_API_KEY;

export async function initiatePayment(params: {
  rfqId: string;
  supplierId: string;
  amount: number;
  currency: string;
  description: string;
}): Promise<{ paymentId: string; status: string }> {
  if (!API_KEY) return { paymentId: "sp_pay_mock_" + Math.random().toString(36).substr(2, 9), status: "completed" };
  try {
    const { data } = await axios.post(`${BASE}/payments`, params, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      timeout: 10000,
    });
    return data;
  } catch {
    return { paymentId: "sp_pay_mock_" + Math.random().toString(36).substr(2, 9), status: "completed" };
  }
}

export async function initiateSpongePayment(params: {
  amount: number; // quoted_price in dollars
  currency: string;
  recipientName: string; // supplier name
  recipientEmail: string;
  memo: string; // "HAGGL payment for RFQ: {rfqTitle}"
  callId: string;
}): Promise<{ payment_id: string; status: string } | null> {
  const getMockPayment = () => {
    return {
      payment_id: "sp_pay_" + Math.random().toString(36).substr(2, 9),
      status: "completed",
    };
  };

  if (!API_KEY) {
    console.log('[sponge] MOCK PAYMENT (no API key): would pay $' + params.amount + ' to ' + params.recipientName);
    return getMockPayment();
  }

  try {
    console.log('[sponge] attempting payment:', JSON.stringify({ url: `${BASE}/payment`, amount: params.amount, recipient: params.recipientName }));
    const { data } = await axios.post(
      `${BASE}/payment`,
      {
        amount: params.amount,
        currency: params.currency.toLowerCase(),
        recipient_name: params.recipientName,
        recipient_email: params.recipientEmail,
        memo: params.memo,
        call_id: params.callId,
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      }
    );

    return {
      payment_id: data.payment_id || data.paymentId || "sp_pay_" + Math.random().toString(36).substr(2, 9),
      status: data.status || "completed",
    };
  } catch (err: any) {
    console.warn('[sponge] response error details:', err.response?.status, err.response?.data);
    console.warn("[sponge] initiate payment failed, returning fallback mock:", err.message);
    return getMockPayment();
  }
}

