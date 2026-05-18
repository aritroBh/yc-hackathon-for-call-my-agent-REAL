/**
 * Gemini Live voice session manager.
 *
 * Wraps @google/genai ai.live.connect() to produce a stable GeminiHandle
 * used by the media-stream route. Handles:
 *   - Session lifecycle (open / close / error)
 *   - Input audio transcription events  → opusInjector.onSupplierText()
 *   - Output audio transcription events → opusInjector.onAgentText()
 *   - Opus intel injection mid-call via sendRealtimeInput({ text })
 *   - Audio I/O conversion (audioConverter helpers)
 *
 * ── LiveServerMessage field paths (confirmed from @google/genai types) ──
 *
 *   Input transcription  (supplier/user speech):
 *     msg.serverContent?.inputTranscription?.text
 *
 *   Output transcription (agent/Gemini speech):
 *     msg.serverContent?.outputTranscription?.text
 *
 *   Audio output (PCM16 24kHz, base64):
 *     msg.data  (convenience getter — concatenates inlineData from modelTurn parts)
 *
 * ── sendRealtimeInput({ text }) ─────────────────────────────────────────
 *   Sends a text message into the live session mid-call.
 *   Gemini treats it as a user realtime input turn and uses it to inform
 *   its next spoken response without reading it aloud (enforced via the
 *   system prompt rule #7).  This is the injection point for OpusInjector.
 *
 * ── Model ───────────────────────────────────────────────────────────────
 *   gemini-live-2.5-flash-preview  (latest stable Live API model)
 */

import {
  GoogleGenAI,
  Modality,
  type Session,
  type LiveServerMessage,
} from '@google/genai'
import { OpusInjector, type NegotiationContext } from '../opus/opusInjector'
import { buildSystemPrompt } from './systemPrompt'
import {
  mulawToLinear16,
  linear16ToMulaw,
  upsample8kTo16k,
  downsample24kTo8k,
} from './audioConverter'

// ── Constants ──────────────────────────────────────────────────────

const MODEL = 'gemini-live-2.5-flash-preview'

// ── Types ──────────────────────────────────────────────────────────

export interface GeminiSessionOptions {
  /** Called with Gemini PCM16 24kHz → mulaw 8kHz audio ready for Twilio. */
  onAudioOutput?: (mulawBuf: Buffer) => void

  /** Emitted on every agent/Gemini output transcription segment. */
  onAgentTranscript?: (text: string) => void

  /** Emitted on every supplier/user input transcription segment. */
  onSupplierTranscript?: (text: string) => void

  /** Called when the session encounters a fatal error. */
  onError?: (err: Error) => void

  /** Called when the WebSocket connection closes cleanly. */
  onClose?: () => void

  /** If provided, OpusInjector is activated for this session. */
  negotiationContext?: NegotiationContext

  /**
   * BCP-47 language code for the session (e.g. 'hi-IN', 'bn-IN', 'en-US').
   * Passed to Gemini Live speechConfig for language-aware TTS.
   */
  languageCode?: string
}

export interface GeminiHandle {
  /**
   * Forward a Twilio mulaw 8kHz audio buffer into the Gemini Live session.
   * Internally converts: mulaw 8kHz → PCM16 8kHz → PCM16 16kHz.
   */
  sendAudio(mulawBuf: Buffer): void

  /**
   * Forward raw PCM16 16kHz audio directly into the Gemini Live session.
   * Use this when the caller already has PCM16 (e.g. Vapi custom-transcriber
   * sends PCM16 stereo 16kHz — extract ch0 and pass here without mulaw decode).
   */
  sendPCM16k(pcmBuf: Buffer): void

  /**
   * Inject a text message mid-call into the Gemini Live session.
   * Calls session.sendRealtimeInput({ text }).
   * Used by OpusInjector to deliver procurement intel without the agent
   * reading it aloud.
   */
  sendText(text: string): void

  /** Cleanly stop the OpusInjector and close the WebSocket session. */
  close(): void

  /** Reference to the OpusInjector, or null if no negotiationContext was given. */
  opusInjector: OpusInjector | null
}

// ── Module-level Gemini client singleton ───────────────────────────

let _ai: GoogleGenAI | null = null

function getAI(): GoogleGenAI {
  if (!_ai) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('[liveSession] GEMINI_API_KEY is not set')
    _ai = new GoogleGenAI({ apiKey })
  }
  return _ai
}

// ── openGeminiSession ─────────────────────────────────────────────

/**
 * Opens a Gemini Live session and returns a GeminiHandle.
 *
 * @param systemPromptText  Full system prompt (use buildSystemPrompt())
 * @param opts              Callbacks + optional negotiation context
 */
export async function openGeminiSession(
  systemPromptText: string,
  opts: GeminiSessionOptions = {}
): Promise<GeminiHandle> {
  const ai = getAI()

  // ── Build OpusInjector before connecting so the inject closure is ready ──
  //   The actual injectText closure captures `liveSession` — we assign it
  //   after connect() resolves via a ref pattern.
  let sessionRef: Session | null = null

  const opusInjector: OpusInjector | null = opts.negotiationContext
    ? new OpusInjector({
        injectText: (text: string) => {
          // sendRealtimeInput({ text }) injects text mid-call into the
          // Gemini Live session. Gemini uses this to inform its next
          // spoken response without reading the raw message aloud.
          sessionRef?.sendRealtimeInput({ text })
        },
        negotiationContext: opts.negotiationContext,
      })
    : null

  // ── onmessage handler — defined before connect() ──────────────────
  function handleMessage(msg: LiveServerMessage): void {
    // ── Input audio transcription (supplier/user speech) ────────────
    const inputText = msg.serverContent?.inputTranscription?.text
    if (inputText) {
      opts.onSupplierTranscript?.(inputText)
      opusInjector?.onSupplierText(inputText)
    }

    // ── Output audio transcription (agent/Gemini speech) ────────────
    const outputText = msg.serverContent?.outputTranscription?.text
    if (outputText) {
      opts.onAgentTranscript?.(outputText)
      opusInjector?.onAgentText(outputText)
    }

    // ── Audio output (Gemini PCM16 24kHz → mulaw 8kHz → Twilio) ────
    // msg.data is the SDK convenience getter: concatenates all inlineData
    // base64 strings from serverContent.modelTurn.parts[].inlineData.data
    const b64Audio = msg.data
    if (b64Audio) {
      const pcm24kBuf = Buffer.from(b64Audio, 'base64')
      const pcm8kBuf = downsample24kTo8k(pcm24kBuf)
      const mulawBuf = linear16ToMulaw(pcm8kBuf)
      opts.onAudioOutput?.(mulawBuf)
    }
  }

  // ── Connect ────────────────────────────────────────────────────────
  let liveSession: Session

  try {
    liveSession = await ai.live.connect({
      model: MODEL,
      config: {
        // Enable both transcription directions
        inputAudioTranscription: {},   // supplier/user speech → text
        outputAudioTranscription: {},  // agent/Gemini speech  → text

        responseModalities: [Modality.AUDIO],

        systemInstruction: systemPromptText,

        // Gemini handles end-of-speech detection natively — no custom VAD needed
        realtimeInputConfig: {
          automaticActivityDetection: {},
        },

        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Aoede' },
          },
          ...(opts.languageCode ? { languageCode: opts.languageCode } : {}),
        },
      },
      callbacks: {
        onopen: () => {
          console.log('[liveSession] connected to Gemini Live')
        },
        onmessage: handleMessage,
        onerror: (e: ErrorEvent) => {
          console.error('[liveSession] WebSocket error:', e.message)
          opts.onError?.(new Error(e.message))
        },
        onclose: (e: CloseEvent) => {
          console.log(`[liveSession] closed — code=${e.code} reason=${e.reason}`)
          opusInjector?.stop()
          opts.onClose?.()
        },
      },
    })
  } catch (err: any) {
    opusInjector?.stop()
    throw new Error(
      `[liveSession] Failed to connect to Gemini Live: ${err?.message ?? err}`
    )
  }

  // Assign sessionRef so the OpusInjector closure can call sendRealtimeInput
  sessionRef = liveSession

  // Start watching transcript
  opusInjector?.start()

  // ── Build and return the handle ────────────────────────────────────
  const handle: GeminiHandle = {
    sendAudio(mulawBuf: Buffer): void {
      // Twilio mulaw 8kHz → PCM16 8kHz → PCM16 16kHz (Gemini input rate)
      const pcm8kBuf = mulawToLinear16(mulawBuf)
      const pcm16kBuf = upsample8kTo16k(pcm8kBuf)
      liveSession.sendRealtimeInput({
        audio: {
          data: pcm16kBuf.toString('base64'),
          mimeType: 'audio/pcm;rate=16000',
        },
      })
    },

    sendPCM16k(pcmBuf: Buffer): void {
      // Raw PCM16 16kHz — from Vapi custom-transcriber (ch0 already extracted)
      liveSession.sendRealtimeInput({
        audio: {
          data: pcmBuf.toString('base64'),
          mimeType: 'audio/pcm;rate=16000',
        },
      })
    },

    sendText(text: string): void {
      liveSession.sendRealtimeInput({ text })
    },

    close(): void {
      opusInjector?.stop()
      try {
        liveSession.close()
      } catch {
        // Already closed — ignore
      }
      sessionRef = null
    },

    opusInjector,
  }

  return handle
}

// ── Re-export helpers for callers ──────────────────────────────────
export { buildSystemPrompt }
export type { NegotiationContext }
