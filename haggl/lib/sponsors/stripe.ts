import Stripe from "stripe";

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

// Graceful initializer
const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET, {
  apiVersion: "2024-04-10" as any,
}) : null;

export async function createPaymentLink(
  amount: number, // Quoted price in dollars
  currency: string,
  metadata: Record<string, string>
): Promise<{ url: string; paymentLinkId: string } | null> {
  if (!stripe) {
    console.warn('[stripe] STRIPE_SECRET_KEY not set — payment link skipped');
    return null;
  }

  try {
    // 1. Create a Stripe Product and Price for the custom amount
    const priceAmountCents = Math.round(amount * 100);
    const product = await stripe.products.create({
      name: `HAGGL Procurement Payment: RFQ ${metadata.rfq_id || ""}`,
      description: `Payment for supplier quote on call ${metadata.call_id || ""}`,
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: priceAmountCents,
      currency: currency.toLowerCase(),
    });

    // 2. Create the Payment Link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      metadata,
    });

    console.log(`[stripe] created payment link: ${paymentLink.id}`);
    return {
      url: paymentLink.url,
      paymentLinkId: paymentLink.id
    };
  } catch (err: any) {
    console.error('[stripe] createPaymentLink failed:', err.message);
    return null;
  }
}

export async function recordSavingsEvent(
  rfqId: string,
  savingsAmount: number
): Promise<void> {
  if (!stripe) {
    console.warn(`[stripe] STRIPE_SECRET_KEY not set — savings event not recorded for RFQ: ${rfqId}`);
    return;
  }

  try {
    // Record as Stripe customer event / log in customer object metadata
    // We can search for or create a default "HAGGL Buyer" customer to track all savings events
    const customers = await stripe.customers.list({ limit: 1 });
    let customer;
    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({
        name: "HAGGL Enterprise Procurement Portal",
        email: "finance@haggl.ai",
      });
    }

    // Accumulate total savings into customer metadata
    const currentSavings = parseFloat(customer.metadata.total_savings_usd || "0");
    const newSavings = currentSavings + savingsAmount;

    await stripe.customers.update(customer.id, {
      metadata: {
        total_savings_usd: newSavings.toString(),
        last_savings_rfq: rfqId,
        last_savings_amount: savingsAmount.toString(),
      },
    });

    console.log(`[stripe] successfully tracked savings: total=$${newSavings.toFixed(2)} (+${savingsAmount.toFixed(2)})`);
  } catch (err: any) {
    console.warn("[stripe] failed to record savings event:", err.message);
  }
}
