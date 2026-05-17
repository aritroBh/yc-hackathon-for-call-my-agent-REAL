/**
 * Audio codec utilities for the Gemini Live ↔ Twilio bridge.
 *
 * Pipeline (inbound — Twilio → Gemini):
 *   Twilio mulaw 8kHz  →  mulawToLinear16()  →  PCM16 8kHz
 *                      →  upsample8kTo16k()   →  PCM16 16kHz  → Gemini
 *
 * Pipeline (outbound — Gemini → Twilio):
 *   Gemini PCM16 24kHz →  downsample24kTo8k() →  PCM16 8kHz
 *                      →  linear16ToMulaw()   →  mulaw 8kHz   → Twilio
 *
 * All functions accept and return Node.js Buffers (raw byte arrays) with
 * samples in little-endian signed 16-bit format (PCM16LE).
 */

// ── μ-law lookup tables (built once at module load) ─────────────────

const MULAW_BIAS = 0x84
const MULAW_MAX = 32635

/** Mulaw byte index → PCM s16le sample value */
const decodeTable = new Int16Array(256)

/** PCM s16le sample (offset by MULAW_MAX) → mulaw byte */
const encodeTable = new Uint8Array(65536)

function buildLookupTables(): void {
  // Decoder
  for (let i = 0; i < 256; i++) {
    const mulaw = ~i
    const sign = mulaw & 0x80
    const exponent = (mulaw >> 4) & 0x07
    const mantissa = mulaw & 0x0f
    let sample = ((mantissa << 3) + MULAW_BIAS) << exponent
    if (sign) sample = -sample
    decodeTable[i] = Math.max(-32768, Math.min(32767, sample))
  }

  // Encoder
  for (let s = -MULAW_MAX; s <= MULAW_MAX; s++) {
    const sign = s < 0 ? 0x80 : 0
    let val = s < 0 ? -s : s
    if (val > MULAW_MAX) val = MULAW_MAX
    let exp = 0
    while ((val >> (exp + 3)) > 0x0f && exp < 8) exp++
    const mantissa = (val >> exp) - MULAW_BIAS
    const encoded = ~(sign | (exp << 4) | (mantissa & 0x0f))
    const idx = s + MULAW_MAX
    if (idx >= 0 && idx < 65536) encodeTable[idx] = encoded & 0xff
  }
}

buildLookupTables()

// ── mulaw ↔ PCM16 ───────────────────────────────────────────────────

/**
 * Decode Twilio mulaw bytes to PCM16LE samples (Buffer with 2× the byte length).
 * Input:  N mulaw bytes at 8kHz
 * Output: 2N bytes (N PCM16LE samples) at 8kHz
 */
export function mulawToLinear16(mulawBuf: Buffer): Buffer {
  const out = Buffer.allocUnsafe(mulawBuf.length * 2)
  for (let i = 0; i < mulawBuf.length; i++) {
    out.writeInt16LE(decodeTable[mulawBuf[i]], i * 2)
  }
  return out
}

/**
 * Encode PCM16LE samples to mulaw bytes.
 * Input:  2N bytes (N PCM16LE samples)
 * Output: N mulaw bytes
 */
export function linear16ToMulaw(pcmBuf: Buffer): Buffer {
  const nSamples = Math.floor(pcmBuf.length / 2)
  const out = Buffer.allocUnsafe(nSamples)
  for (let i = 0; i < nSamples; i++) {
    const sample = pcmBuf.readInt16LE(i * 2)
    const idx = Math.max(0, Math.min(65535, sample + MULAW_MAX))
    out[i] = encodeTable[idx]
  }
  return out
}

// ── Sample-rate conversion ───────────────────────────────────────────

/**
 * Upsample PCM16LE 8kHz → 16kHz by nearest-neighbour (factor ×2).
 * Gemini Live expects audio/pcm at 16kHz on its input channel.
 *
 * Input:  N PCM16LE samples at 8kHz  (2N bytes)
 * Output: 2N PCM16LE samples at 16kHz (4N bytes)
 */
export function upsample8kTo16k(pcm8kBuf: Buffer): Buffer {
  const nIn = Math.floor(pcm8kBuf.length / 2)
  const out = Buffer.allocUnsafe(nIn * 4) // 2× samples × 2 bytes each
  for (let i = 0; i < nIn; i++) {
    const sample = pcm8kBuf.readInt16LE(i * 2)
    out.writeInt16LE(sample, i * 4)
    out.writeInt16LE(sample, i * 4 + 2)
  }
  return out
}

/**
 * Downsample PCM16LE 24kHz → 8kHz by simple decimation (factor ÷3).
 * Gemini Live outputs PCM16 at 24kHz; Twilio Media Streams expect 8kHz.
 *
 * Input:  3N PCM16LE samples at 24kHz (6N bytes)
 * Output: N PCM16LE samples at 8kHz  (2N bytes)
 */
export function downsample24kTo8k(pcm24kBuf: Buffer): Buffer {
  const nIn = Math.floor(pcm24kBuf.length / 2)
  const nOut = Math.floor(nIn / 3)
  const out = Buffer.allocUnsafe(nOut * 2)
  for (let i = 0; i < nOut; i++) {
    out.writeInt16LE(pcm24kBuf.readInt16LE(i * 6), i * 2)
  }
  return out
}
