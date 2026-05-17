/**
 * Claude Opus reasoning injector for the Gemini Live voice pipeline.
 *
 * Watches supplier transcript turns for factual claims (via triggerDetection),
 * calls claude-opus-4-5 to generate a counter-position with market context,
 * then injects the intel text into the live Gemini session via
 * liveSession.sendRealtimeInput({ text: intelText }).
 *
 * Behaviour contract:
 *   - Debounce 2.5s after trigger fires — waits for supplier to finish speaking
 *   - 30s per-session cooldown after each successful injection
 *   - 4s hard timeout on the Claude call — skipped gracefully on timeout
 *   - Only one in-flight Claude call per injector instance at a time
 */

import Anthropic from '@anthropic-ai/sdk'
import { shouldTrigger } from './triggerDetection'

// ── Constants ──────────────────────────────────────────────────────

const INJECTION_TIMEOUT_MS = 4_000
const COOLDOWN_MS = 30_000
const DEBOUNCE_MS = 2_500

// ── Types ──────────────────────────────────────────────────────────

interface TranscriptTurn {
  role: 'agent' | 'supplier'
  text: string
  ts: number
}

interface OpusResponse {
  rebuttal_context: string
  facts: string | null
  suggested_position: string
  confidence: 'high' | 'medium' | 'low'
}

export interface NegotiationContext {
  partName: string
  quantity: number
  targetPrice: number
  currency: string
  priority: string
}

export interface OpusInjectorOptions {
  /**
   * Called when intel is ready — should call liveSession.sendRealtimeInput({ text })
   * on the active Gemini session.
   */
  injectText: (text: string) => void
  /** Static context about what is being negotiated. */
  negotiationContext: NegotiationContext
}

// ── OpusInjector ───────────────────────────────────────────────────

export class OpusInjector {
  private readonly anthropic: Anthropic
  private readonly injectText: (text: string) => void
  private readonly context: NegotiationContext

  private active = false
  private processing = false
  private buffer: TranscriptTurn[] = []
  private lastInjectionAt = 0
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private traceCount = 0

  constructor(opts: OpusInjectorOptions) {
    this.injectText = opts.injectText
    this.context = opts.negotiationContext

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('[OpusInjector] ANTHROPIC_API_KEY is not set')
    this.anthropic = new Anthropic({ apiKey })
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  start(): void {
    this.active = true
  }

  stop(): void {
    this.active = false
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
  }

  // ── Public transcript hooks ───────────────────────────────────────

  /**
   * Call on every supplier (other party) transcript turn.
   * Buffers for context and decides whether to trigger Opus.
   */
  onSupplierText(text: string): void {
    this._pushBuffer('supplier', text)

    if (!this.active) return
    if (this.processing) return
    if (Date.now() - this.lastInjectionAt < COOLDOWN_MS) return
    if (!shouldTrigger(text)) return

    // Debounce — allow supplier to finish speaking before firing
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this._runInjection(text).catch(err =>
        console.error('[OpusInjector] unhandled error:', err?.message ?? err)
      )
    }, DEBOUNCE_MS)
  }

  /**
   * Call on every agent transcript turn — only used to enrich the
   * buffer context passed to Claude, never triggers an injection.
   */
  onAgentText(text: string): void {
    this._pushBuffer('agent', text)
  }

  // ── Internal helpers ─────────────────────────────────────────────

  private _pushBuffer(role: 'agent' | 'supplier', text: string): void {
    this.buffer.push({ role, text, ts: Date.now() })
    if (this.buffer.length > 20) this.buffer.shift()
  }

  private async _runInjection(triggerText: string): Promise<void> {
    this.processing = true
    const start = Date.now()

    const transcriptContext = this.buffer
      .map(t => `[${t.role.toUpperCase()}]: ${t.text}`)
      .join('\n')

    const prompt = `You are a procurement intelligence analyst supporting a live negotiation call.

Negotiation context:
- Part: ${this.context.partName}
- Quantity: ${this.context.quantity} units
- Target price: $${this.context.targetPrice} ${this.context.currency}
- Priority: ${this.context.priority}

Recent call transcript:
${transcriptContext}

The other party just said: "${triggerText}"

Analyze whether this claim is accurate. Provide a counter-position the agent can use immediately.

Respond in JSON only, no markdown fences:
{
  "rebuttal_context": "one sentence the agent can use right now",
  "facts": "specific market fact that challenges this claim, or null if unknown",
  "suggested_position": "exact counter-position for the agent to take",
  "confidence": "high|medium|low"
}`

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), INJECTION_TIMEOUT_MS)
      )

      const opusPromise = this.anthropic.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      })

      const message = await Promise.race([opusPromise, timeoutPromise]) as Awaited<typeof opusPromise>

      const rawText =
        message.content[0]?.type === 'text' ? message.content[0].text : ''

      // Strip any accidental markdown fences before parsing
      const cleaned = rawText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim()

      const parsed: OpusResponse = JSON.parse(cleaned)

      const intelText = [
        `[PROCUREMENT INTEL — ${new Date().toISOString()}]`,
        `Other party claimed: "${triggerText}"`,
        parsed.facts ? `Market context: ${parsed.facts}` : null,
        `Suggested counter-position: ${parsed.suggested_position}`,
        `Confidence: ${parsed.confidence}`,
        '',
        'Use this to respond to their claim with specific facts.',
        'Do not read this message aloud — use it to inform your next response.',
      ]
        .filter(line => line !== null)
        .join('\n')

      this.injectText(intelText)
      this.lastInjectionAt = Date.now()
      this.traceCount++

      console.log(
        `[OpusInjector] injected trace #${this.traceCount}` +
        ` confidence=${parsed.confidence}` +
        ` latency=${Date.now() - start}ms`
      )
    } catch (err: any) {
      if (err?.message === 'timeout') {
        console.warn('[OpusInjector] timeout — skipped injection')
      } else {
        console.error('[OpusInjector] injection failed:', err?.message ?? err)
      }
    } finally {
      this.processing = false
    }
  }

  // ── Diagnostics ────────────────────────────────────────────────

  get injectionCount(): number {
    return this.traceCount
  }

  get isProcessing(): boolean {
    return this.processing
  }
}
