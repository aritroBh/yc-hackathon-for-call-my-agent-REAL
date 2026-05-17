/**
 * Audio helpers for the Vapi <-> Khaya bridge.
 *
 * Everything here operates on 16-bit signed little-endian PCM, matching the
 * conventions in `server/audio.ts`. Vapi's custom transcriber/voice path is
 * linear16 (no mulaw), so the mulaw helpers in server/audio.ts are unused here.
 */

/** Prepend a canonical 44-byte RIFF/WAVE PCM-16 header to raw PCM. */
export function encodeWav(pcm: Buffer, sampleRate: number, channels = 1): Buffer {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // audio format = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bytesPerSample * 8, 34); // bits per sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

export interface StrippedWav {
  pcm: Buffer;
  sampleRate: number;
  channels: number;
  /** 1 = PCM int, 3 = IEEE float. Khaya TTS returns 3 (32-bit float). */
  audioFormat: number;
  bitsPerSample: number;
}

/**
 * Strip a WAV container, returning raw PCM + format. Scans chunk IDs rather
 * than assuming the data chunk starts at offset 44 (Khaya TTS may emit LIST/
 * fact chunks). If there's no RIFF magic, the whole buffer is treated as raw
 * PCM at `fallbackSampleRate`.
 */
export function stripWavHeader(wav: Buffer, fallbackSampleRate = 16000): StrippedWav {
  if (wav.length < 12 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    return { pcm: wav, sampleRate: fallbackSampleRate, channels: 1, audioFormat: 1, bitsPerSample: 16 };
  }

  let sampleRate = fallbackSampleRate;
  let channels = 1;
  let audioFormat = 1;
  let bitsPerSample = 16;
  let offset = 12; // skip RIFF + size + WAVE

  while (offset + 8 <= wav.length) {
    const chunkId = wav.toString("ascii", offset, offset + 4);
    const chunkSize = wav.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;

    if (chunkId === "fmt " && bodyStart + 16 <= wav.length) {
      audioFormat = wav.readUInt16LE(bodyStart);
      channels = wav.readUInt16LE(bodyStart + 2);
      sampleRate = wav.readUInt32LE(bodyStart + 4);
      bitsPerSample = wav.readUInt16LE(bodyStart + 14);
    } else if (chunkId === "data") {
      const end = Math.min(bodyStart + chunkSize, wav.length);
      return { pcm: wav.subarray(bodyStart, end), sampleRate, channels, audioFormat, bitsPerSample };
    }

    // Chunks are word-aligned (pad byte when size is odd).
    offset = bodyStart + chunkSize + (chunkSize % 2);
  }

  // No data chunk found — fall back to everything past the standard header.
  return { pcm: wav.subarray(44), sampleRate, channels, audioFormat, bitsPerSample };
}

/**
 * Normalize WAV sample data to 16-bit signed LE PCM.
 * Khaya TTS returns 32-bit IEEE float (audioFormat 3); Vapi requires int16.
 * Also handles 8-bit unsigned and 24-bit int; 16-bit PCM passes through.
 */
export function decodeToInt16(data: Buffer, audioFormat: number, bitsPerSample: number): Buffer {
  // 16-bit PCM — already correct.
  if (audioFormat === 1 && bitsPerSample === 16) return data;

  // 32-bit IEEE float in [-1, 1].
  if (audioFormat === 3 && bitsPerSample === 32) {
    const n = Math.floor(data.length / 4);
    const out = Buffer.allocUnsafe(n * 2);
    for (let i = 0; i < n; i++) {
      let s = data.readFloatLE(i * 4);
      if (s > 1) s = 1; else if (s < -1) s = -1;
      out.writeInt16LE(Math.round(s * 32767), i * 2);
    }
    return out;
  }

  // 8-bit unsigned PCM.
  if (audioFormat === 1 && bitsPerSample === 8) {
    const n = data.length;
    const out = Buffer.allocUnsafe(n * 2);
    for (let i = 0; i < n; i++) out.writeInt16LE((data[i] - 128) * 256, i * 2);
    return out;
  }

  // 24-bit signed PCM.
  if (audioFormat === 1 && bitsPerSample === 24) {
    const n = Math.floor(data.length / 3);
    const out = Buffer.allocUnsafe(n * 2);
    for (let i = 0; i < n; i++) {
      const b0 = data[i * 3], b1 = data[i * 3 + 1], b2 = data[i * 3 + 2];
      let v = (b2 << 16) | (b1 << 8) | b0;
      if (v & 0x800000) v -= 0x1000000;
      out.writeInt16LE(v >> 8, i * 2);
    }
    return out;
  }

  // 64-bit float (rare).
  if (audioFormat === 3 && bitsPerSample === 64) {
    const n = Math.floor(data.length / 8);
    const out = Buffer.allocUnsafe(n * 2);
    for (let i = 0; i < n; i++) {
      let s = data.readDoubleLE(i * 8);
      if (s > 1) s = 1; else if (s < -1) s = -1;
      out.writeInt16LE(Math.round(s * 32767), i * 2);
    }
    return out;
  }

  // Unknown — return as-is and hope for the best.
  return data;
}

/**
 * Extract one channel from interleaved 16-bit LE stereo into mono PCM.
 * `channelIndex` 0 = left/customer, 1 = right/assistant for Vapi's stream.
 * Tolerates a trailing partial frame (floors to whole stereo frames).
 */
export function deinterleaveStereoChannel(frame: Buffer, channelIndex: 0 | 1): Buffer {
  const bytesPerStereoFrame = 4; // 2 channels * 2 bytes
  const frames = Math.floor(frame.length / bytesPerStereoFrame);
  const out = Buffer.allocUnsafe(frames * 2);
  const sampleOffset = channelIndex * 2;
  for (let i = 0; i < frames; i++) {
    out.writeInt16LE(frame.readInt16LE(i * bytesPerStereoFrame + sampleOffset), i * 2);
  }
  return out;
}

/** Linear-interpolation resampler for 16-bit LE mono PCM. */
export function resampleLinear(pcm: Buffer, fromRate: number, toRate: number): Buffer {
  if (fromRate === toRate || pcm.length < 2) return pcm;
  const inSamples = Math.floor(pcm.length / 2);
  const outSamples = Math.max(1, Math.round((inSamples * toRate) / fromRate));
  const out = Buffer.allocUnsafe(outSamples * 2);
  const ratio = inSamples / outSamples;

  for (let i = 0; i < outSamples; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const s0 = pcm.readInt16LE(Math.min(idx, inSamples - 1) * 2);
    const s1 = pcm.readInt16LE(Math.min(idx + 1, inSamples - 1) * 2);
    let v = Math.round(s0 + (s1 - s0) * frac);
    if (v > 32767) v = 32767;
    else if (v < -32768) v = -32768;
    out.writeInt16LE(v, i * 2);
  }
  return out;
}

/** Root-mean-square amplitude of 16-bit LE mono PCM (0..~32768). */
export function rmsEnergy(pcm: Buffer): number {
  const samples = Math.floor(pcm.length / 2);
  if (samples === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples; i++) {
    const s = pcm.readInt16LE(i * 2);
    sumSquares += s * s;
  }
  return Math.sqrt(sumSquares / samples);
}
