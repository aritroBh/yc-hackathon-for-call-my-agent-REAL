/**
 * Vapi custom-voice endpoint.
 *
 * Vapi POSTs { message: { type: "voice-request", text, sampleRate } } and
 * expects raw MONO 16-bit LE PCM at the requested sample rate (no WAV header),
 * Content-Type application/octet-stream.
 *
 * We synthesize via Khaya TTS (WAV ~16 kHz), strip the header, resample to the
 * requested rate. On Khaya failure we return a short silence buffer so the
 * call degrades gracefully instead of erroring.
 */
import { khayaSynthesize } from "@/lib/khaya";
import { stripWavHeader, decodeToInt16, resampleLinear } from "@/lib/audio/wav";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_RATES = new Set([8000, 16000, 22050, 24000]);

function silence(sampleRate: number, ms = 200): Buffer {
  return Buffer.alloc(Math.floor((sampleRate * ms) / 1000) * 2);
}

function pcmResponse(pcm: Buffer): Response {
  return new Response(new Uint8Array(pcm), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Cache-Control": "no-cache",
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* fall through to validation */
  }

  const message = body?.message ?? {};
  const requestedRate = VALID_RATES.has(message?.sampleRate) ? message.sampleRate : 24000;

  if (message?.type !== "voice-request" || typeof message?.text !== "string" || !message.text.trim()) {
    return pcmResponse(silence(requestedRate));
  }

  // Resolve TTS language from the supplier on this call. Vapi passes the
  // HAGGL call id as ?hcid=… (see lib/vapi.ts voiceUrl).
  const hcid = new URL(req.url).searchParams.get("hcid") || "";
  let ttsLanguage = process.env.KHAYA_TTS_LANGUAGE || "twi";
  if (hcid) {
    try {
      const { getCallById, getSupplierById } = await import("@/lib/db");
      const call = await getCallById(hcid);
      const supplier = call ? await getSupplierById(call.supplier_id) : null;
      const lang = (supplier?.metadata as any)?.language || "twi";
      if (lang === "yoruba") {
        // GhanaNLP Khaya has no Yoruba TTS. Degrade to the Twi voice (the
        // LLM still negotiates in Yoruba) until Yoruba voice support lands.
        console.log(
          "[voice] Yoruba call — Khaya has no Yoruba TTS; using Twi voice (acceptable degradation)",
        );
        ttsLanguage = "twi";
      } else if (lang === "akan" || lang === "twi") {
        ttsLanguage = "twi";
      }
    } catch {
      /* best-effort — never break the call over a language lookup */
    }
  }

  try {
    const wav = await khayaSynthesize(message.text, { language: ttsLanguage });
    const { pcm, sampleRate, channels, audioFormat, bitsPerSample } = stripWavHeader(wav, 16000);

    // Khaya TTS returns 32-bit IEEE float; Vapi needs 16-bit signed PCM.
    const int16 = decodeToInt16(pcm, audioFormat, bitsPerSample);

    // Khaya TTS is mono; if a stereo container ever comes back, take channel 0.
    let mono = int16;
    if (channels === 2) {
      const frames = Math.floor(int16.length / 4);
      mono = Buffer.allocUnsafe(frames * 2);
      for (let i = 0; i < frames; i++) {
        mono.writeInt16LE(int16.readInt16LE(i * 4), i * 2);
      }
    }

    const out = resampleLinear(mono, sampleRate, requestedRate);
    return pcmResponse(out);
  } catch (err: any) {
    console.error("[Vapi custom-voice] Khaya TTS failed:", err?.message);
    return pcmResponse(silence(requestedRate));
  }
}
