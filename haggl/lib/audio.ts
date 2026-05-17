/**
 * Audio codec utilities for Twilio ↔ Deepgram bridging.
 *
 * Twilio sends/receives μ-law 8kHz 8-bit via Media Streams.
 * Deepgram Voice Agent expects/receives linear16 PCM.
 *
 * Pipeline:
 *   Twilio (mulaw 8kHz) → mulawDecode → linear16 8kHz → upsample → linear16 48kHz → Deepgram
 *   Deepgram (linear16 24kHz) → downsample → linear16 8kHz → mulawEncode → mulaw 8kHz → Twilio
 */

// ── μ-law lookup tables (initialized once) ─────────

const MULAW_BIAS = 0x84;
const MULAW_MAX = 32635;

const decodeTable = new Int16Array(256);
const encodeTable = new Uint8Array(65536);

function buildTables(): void {
  for (let i = 0; i < 256; i++) {
    const mulaw = ~i;
    const sign = mulaw & 0x80;
    const exponent = (mulaw >> 4) & 0x07;
    const mantissa = mulaw & 0x0f;
    let sample = ((mantissa << 3) + MULAW_BIAS) << exponent;
    if (sign) sample = -sample;
    decodeTable[i] = clampSample(sample);
  }
  for (let s = -MULAW_MAX; s <= MULAW_MAX; s++) {
    const sign = s < 0 ? 0x80 : 0;
    let sample = s < 0 ? -s : s;
    if (sample > MULAW_MAX) sample = MULAW_MAX;
    let exponent = 0;
    while ((sample >> (exponent + 3)) > 0x0f && exponent < 8) exponent++;
    const mantissa = (sample >> exponent) - MULAW_BIAS;
    const encoded = ~(sign | (exponent << 4) | (mantissa & 0x0f));
    const idx = s + MULAW_MAX;
    if (idx >= 0 && idx < 65536) encodeTable[idx] = encoded & 0xff;
  }
}

function clampSample(sample: number): number {
  if (sample < -32768) return -32768;
  if (sample > 32767) return 32767;
  return sample;
}

buildTables();

// ── μ-law decode: mulaw bytes → PCM s16le ──────────

export function mulawDecode(mulawBuf: Buffer): Int16Array {
  const out = new Int16Array(mulawBuf.length);
  for (let i = 0; i < mulawBuf.length; i++) {
    out[i] = decodeTable[mulawBuf[i]];
  }
  return out;
}

// ── μ-law encode: PCM s16le → mulaw bytes ──────────

export function mulawEncode(pcm: Int16Array): Buffer {
  const buf = Buffer.alloc(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    const idx = pcm[i] + MULAW_MAX;
    if (idx >= 0 && idx < 65536) {
      buf[i] = encodeTable[idx];
    } else {
      buf[i] = 0x7f;
    }
  }
  return buf;
}

// ── Sample rate conversion ──────────────────────────

export function upsample8to48(pcm8k: Int16Array): Int16Array {
  const factor = 6;
  const out = new Int16Array(pcm8k.length * factor);
  for (let i = 0; i < pcm8k.length; i++) {
    const val = pcm8k[i];
    const base = i * factor;
    for (let j = 0; j < factor; j++) {
      out[base + j] = val;
    }
  }
  return out;
}

export function downsample24to8(pcm24k: Int16Array): Int16Array {
  const factor = 3;
  const len = Math.floor(pcm24k.length / factor);
  const out = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = pcm24k[i * factor];
  }
  return out;
}

export function downsample48to8(pcm48k: Int16Array): Int16Array {
  const factor = 6;
  const len = Math.floor(pcm48k.length / factor);
  const out = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = pcm48k[i * factor];
  }
  return out;
}

export function upsample8to24(pcm8k: Int16Array): Int16Array {
  const factor = 3;
  const out = new Int16Array(pcm8k.length * factor);
  for (let i = 0; i < pcm8k.length; i++) {
    const val = pcm8k[i];
    const base = i * factor;
    for (let j = 0; j < factor; j++) {
      out[base + j] = val;
    }
  }
  return out;
}

// ── Buffer ↔ PCM helpers ────────────────────────────

export function pcmToBuffer(pcm: Int16Array): Buffer {
  return Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
}

export function bufferToPcm(buf: Buffer): Int16Array {
  if (buf.length % 2 !== 0) {
    buf = buf.subarray(0, buf.length - (buf.length % 2));
  }
  return new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
}

// ── Audio chunk helpers ─────────────────────────────

export interface AudioChunk {
  payload: Buffer;
  timestamp: number;
  sequence: number;
}

export function chunkMulawPayload(base64Payload: string): AudioChunk {
  return {
    payload: Buffer.from(base64Payload, "base64"),
    timestamp: Date.now(),
    sequence: 0,
  };
}
