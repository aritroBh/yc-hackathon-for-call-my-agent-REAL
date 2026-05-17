import "dotenv/config";
import { khayaSynthesize, khayaTranscribe } from "../lib/khaya";
import { stripWavHeader, decodeToInt16 } from "../lib/audio/wav";

async function main() {
  const text = "Mema wo akye, Owura Kofi. Yɛrehwehwɛ kente ntama yards mpem enum.";
  let t = Date.now();
  const wav = await khayaSynthesize(text);
  const ttsMs = Date.now() - t;
  const s = stripWavHeader(wav, 16000);
  const i16 = decodeToInt16(s.pcm, s.audioFormat, s.bitsPerSample);
  console.log(
    `TTS v2: ${ttsMs}ms bytes=${wav.length} audioFormat=${s.audioFormat} bits=${s.bitsPerSample} sr=${s.sampleRate} ch=${s.channels} -> int16 ${i16.length}b`
  );
  t = Date.now();
  const back = await khayaTranscribe(wav);
  console.log(`ASR v3 round-trip: ${Date.now() - t}ms -> "${back}"`);
}

main().catch((e) => { console.error("ERR", e?.message); process.exit(1); });
