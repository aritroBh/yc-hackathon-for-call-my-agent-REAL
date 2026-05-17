export function mulawDecode(mulawBuf: Buffer): Buffer {
  const out = Buffer.allocUnsafe(mulawBuf.length * 2)
  for (let i = 0; i < mulawBuf.length; i++) {
    let mulaw = ~mulawBuf[i] & 0xFF
    const sign = mulaw & 0x80
    const exponent = (mulaw >> 4) & 0x07
    const mantissa = mulaw & 0x0F
    let sample = ((mantissa << 3) + 0x84) << exponent
    sample -= 0x84
    out.writeInt16LE(sign ? -sample : sample, i * 2)
  }
  return out
}

export function mulawEncode(pcmBuf: Buffer): Buffer {
  const BIAS = 0x84
  const CLIP = 32767
  const numSamples = Math.floor(pcmBuf.length / 2)
  const out = Buffer.allocUnsafe(numSamples)
  for (let i = 0; i < numSamples; i++) {
    let sample = pcmBuf.readInt16LE(i * 2)
    const sign = sample < 0 ? 0x80 : 0
    if (sample < 0) sample = -sample
    sample = Math.min(sample + BIAS, CLIP)
    let exp = 7
    for (let mask = 0x4000; (sample & mask) === 0 && exp > 0; exp--, mask >>= 1) {}
    const mantissa = (sample >> (exp + 3)) & 0x0F
    out[i] = ~(sign | (exp << 4) | mantissa) & 0xFF
  }
  return out
}

export function upsample8to48(buf: Buffer): Buffer {
  const numSamples = Math.floor(buf.length / 2)
  const out = Buffer.allocUnsafe(numSamples * 12)
  for (let i = 0; i < numSamples; i++) {
    const sample = buf.readInt16LE(i * 2)
    for (let j = 0; j < 6; j++) out.writeInt16LE(sample, i * 12 + j * 2)
  }
  return out
}

export function downsample24to8(buf: Buffer): Buffer {
  const numSamples = Math.floor(buf.length / 2)
  const outSamples = Math.floor(numSamples / 3)
  const out = Buffer.allocUnsafe(outSamples * 2)
  for (let i = 0; i < outSamples; i++) {
    out.writeInt16LE(buf.readInt16LE(i * 6), i * 2)
  }
  return out
}
