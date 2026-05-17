import "dotenv/config";
import * as fs from "fs";
import { khayaSynthesize } from "../lib/khaya";
import { stripWavHeader, resampleLinear } from "../lib/audio/wav";

function asWav(pcm: Buffer, sr: number, ch = 1): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(ch, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * ch * 2, 28);
  h.writeUInt16LE(ch * 2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function main() {
  const wav = await khayaSynthesize("Mema wo akye, Owura Kofi");
  fs.writeFileSync("/tmp/khaya_raw.wav", wav);
  console.log("RAW len", wav.length, "magic", wav.toString("ascii", 0, 4), wav.toString("ascii", 8, 12));

  let off = 12;
  while (off + 8 <= wav.length) {
    const id = wav.toString("ascii", off, off + 4);
    const sz = wav.readUInt32LE(off + 4);
    let extra = "";
    if (id === "fmt ") {
      extra = `audioFormat=${wav.readUInt16LE(off + 8)} ch=${wav.readUInt16LE(off + 10)} sr=${wav.readUInt32LE(off + 12)} bits=${wav.readUInt16LE(off + 22)}`;
    }
    console.log(`chunk '${id}' size=${sz} ${extra}`);
    if (id === "data") { console.log("  data body @", off + 8); break; }
    off = off + 8 + sz + (sz % 2);
  }

  const s = stripWavHeader(wav, 16000);
  console.log("stripWavHeader -> sr", s.sampleRate, "ch", s.channels, "pcmLen", s.pcm.length);
  fs.writeFileSync("/tmp/khaya_stripped.wav", asWav(s.pcm, s.sampleRate, s.channels));

  const r = resampleLinear(s.pcm, s.sampleRate, 24000);
  fs.writeFileSync("/tmp/khaya_24k.wav", asWav(r, 24000, 1));
  console.log("resampled -> 24k pcmLen", r.length);
}

main().catch((e) => { console.error("ERR", e?.message); process.exit(1); });
