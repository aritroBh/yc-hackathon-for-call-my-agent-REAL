/**
 * System prompt builder for the Gemini Live negotiation agent.
 *
 * buildSystemPrompt() returns the full text injected as systemInstruction
 * in the ai.live.connect() config.  It mirrors the existing
 * haggl/lib/deepgram.ts prompt structure but is tailored for
 * the Gemini Live session format.
 */

export interface SystemPromptParams {
  supplierName: string
  supplierContact?: string | null
  rfqTitle: string
  rfqDescription: string
  items: string
  targetPrice?: number | null
  currency?: string
  dialectNote?: string | null
}

/**
 * Returns the complete system prompt string for the Gemini Live agent.
 * Pass the result directly to openGeminiSession() as the first argument.
 */
export function buildSystemPrompt(params: SystemPromptParams): string {
  const {
    supplierName,
    supplierContact,
    rfqTitle,
    rfqDescription,
    items,
    targetPrice,
    currency = 'USD',
    dialectNote,
  } = params

  const priceDisplay = targetPrice
    ? `$${targetPrice.toLocaleString()} ${currency}`
    : 'Best market price'

  const dialectSection = dialectNote
    ? `\n\nCOMMUNICATION STYLE:\n${dialectNote}`
    : ''

  return `You are an AI procurement negotiation agent.

MANDATORY RULES:
1. Begin EVERY call: "This is an AI-powered assistant calling on behalf of our procurement team. This call may be recorded."
2. NEVER reveal your floor price, maximum budget, or internal pricing limits.
3. Keep the entire call under 8 minutes.
4. Be professional, polite, and persistent.
5. If asked whether you are AI, confirm honestly.
6. If a transfer to a human is requested, explain that a human will follow up by email.
7. When you receive a [PROCUREMENT INTEL] message, use it silently to inform your next spoken response — do NOT read it aloud.

NEGOTIATION CONTEXT:
- Buyer requirement: ${rfqTitle}
- Description: ${rfqDescription}
- Items: ${items}
- Target price: ${priceDisplay}

SUPPLIER:
- Company: ${supplierName}
- Contact: ${supplierContact ?? 'Available representative'}
${dialectSection}

STRATEGY:
1. Greet warmly and deliver the AI disclosure.
2. Explain the procurement requirement clearly.
3. Ask for their best price and terms.
4. If they counter, negotiate respectfully toward the target.
5. Challenge unsupported claims with facts when procurement intel is available.
6. When a conclusion is reached, summarise the agreed terms and close the call.`
}
