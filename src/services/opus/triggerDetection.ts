/**
 * Trigger detection for the Gemini Live voice pipeline.
 *
 * Watches supplier transcript text for factual claims that warrant
 * a Claude Opus counter-position injection into the live Gemini session.
 *
 * Patterns cover the most common negotiation-deflection categories:
 * price/cost escalation, material costs, compliance burdens, supply
 * constraints, causal market framing, floor-price declarations,
 * geopolitical/tariff justifications, and logistics cost claims.
 */

export const TRIGGER_PATTERNS: RegExp[] = [
  // Price / cost escalation claims
  /(?:price|cost|rate|charge).{0,40}(?:increase|went up|higher|more expensive|risen)/i,

  // Material cost claims
  /(?:steel|aluminum|copper|material|raw material).{0,40}(?:cost|price|expensive)/i,

  // Compliance / certification burden claims
  /(?:iso|regulation|compliance|certification|standard).{0,40}(?:require|cost|mandate)/i,

  // Supply / demand constraint claims
  /(?:demand|shortage|supply chain|backorder|capacity).{0,40}(?:high|low|issue|problem)/i,

  // Causal market-framing ("because the market…", "due to cost…")
  /(?:because|due to|as a result|given that).{0,30}(?:market|industry|cost|price)/i,

  // Floor-price / MOQ declarations
  /(?:best.{0,20}price|lowest.{0,20}can|minimum.{0,20}order|cannot go below)/i,

  // Tariff / geopolitical justifications
  /(?:tariff|import|export|duty|sanction|geopolit)/i,

  // Logistics / freight cost claims
  /(?:shipping|freight|logistics|delivery).{0,30}(?:cost|delay|expensive|increase)/i,
]

/**
 * Returns true if any trigger pattern matches the given text.
 * Called on every supplier transcript turn before deciding whether
 * to fire a Claude Opus reasoning task.
 */
export function shouldTrigger(text: string): boolean {
  return TRIGGER_PATTERNS.some(p => p.test(text))
}
