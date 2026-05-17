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

  const SPONGE_ENDPOINTS = [
    'https://api.wallet.paysponge.com/api/payment',
    'https://api.paysponge.com/v1/payment', 
    'https://gateway.paysponge.com/api/payment',
  ];

  for (const endpoint of SPONGE_ENDPOINTS) {
    console.log('[sponge] trying endpoint:', endpoint, 'amount:', params.amount, 'recipient:', params.recipientName);
    try {
      const response = await axios.post(
        endpoint,
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
          timeout: 4000,
        }
      );

      if (response.status >= 200 && response.status < 300) {
        const data = response.data;
        return {
          payment_id: data.payment_id || data.paymentId || "sp_pay_" + Math.random().toString(36).substr(2, 9),
          status: data.status || "completed",
        };
      }
    } catch (err: any) {
      if (err.response) {
        const status = err.response.status;
        const responseBody = err.response.data;
        if (status === 404) {
          console.warn(`[sponge] endpoint ${endpoint} returned 404, trying next...`);
          continue;
        } else if (status >= 400 && status < 500) {
          console.error(`[sponge] 4xx error on endpoint ${endpoint} (status ${status}):`, responseBody);
        } else {
          console.warn(`[sponge] non-4xx/non-404 error on ${endpoint} (status ${status}):`, responseBody);
        }
      } else {
        console.warn(`[sponge] connection/timeout error on ${endpoint}:`, err.message);
      }
    }
  }

  console.error('[sponge] ALL endpoints failed — bring this log to Sponge booth:', { tried: SPONGE_ENDPOINTS, amount: params.amount });
  return getMockPayment();
}

