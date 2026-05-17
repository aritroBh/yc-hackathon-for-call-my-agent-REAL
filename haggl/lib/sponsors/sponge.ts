import axios from "axios";

const BASE = "https://api.paysponge.com/v1";
const API_KEY = process.env.SPONGE_API_KEY;

export async function initiatePayment(params: {
  rfqId: string;
  supplierId: string;
  amount: number;
  currency: string;
  description: string;
}): Promise<{ paymentId: string; status: string }> {
  if (!API_KEY) return { paymentId: "", status: "skipped" };
  const { data } = await axios.post(`${BASE}/payments`, params, {
    headers: { Authorization: `Bearer ${API_KEY}` },
    timeout: 10000,
  });
  return data;
}
