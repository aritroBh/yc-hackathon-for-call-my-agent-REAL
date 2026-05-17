/**
 * GhanaNLP / Khaya AI client — batch ASR (STT) + TTS.
 *
 * Auth: single subscription key sent as `Ocp-Apim-Subscription-Key`.
 * Both ASR and TTS are batch HTTP (no streaming) — the WS buffering/endpointing
 * lives in lib/vapi/transcriberSocket.ts.
 *
 * Mirrors lib/agentphone.ts conventions (axios + withRetry + logger).
 */
import axios from "axios";
import { withRetry } from "./retry";
import { logger } from "./logger";

const BASE_URL = process.env.KHAYA_BASE_URL || "https://translation-api.ghananlp.org";
const API_KEY = process.env.KHAYA_API_KEY;
// Codes differ per service/version (discovered via the /languages endpoints):
//   ASR v3   -> tw   (GET /asr/v3/languages: tw|dag|ee)
//   TTS v2   -> twi  (GET /tts/v2/languages: Asante Twi = "twi")
//   Translate-> tw
const ASR_LANGUAGE = process.env.KHAYA_ASR_LANGUAGE || process.env.KHAYA_LANGUAGE || "tw";
const TTS_LANGUAGE = process.env.KHAYA_TTS_LANGUAGE || "twi";
// TTS v2 speakers (GET /tts/v2/speakers): male_low | male_high | female
const DEFAULT_SPEAKER = process.env.KHAYA_TTS_SPEAKER_ID || "male_low";

function authHeader(): Record<string, string> {
  if (!API_KEY) {
    throw new Error("KHAYA_API_KEY is not configured in environment variables");
  }
  return { "Ocp-Apim-Subscription-Key": API_KEY };
}

/**
 * Transcribe a complete audio clip. `audio` should be WAV bytes (Khaya accepts
 * wav/mp3 under the audio/mpeg content-type per the API docs).
 * Returns the transcript string, or "" on empty/failure (caller skips empties).
 *
 * The success-response JSON key is not authoritatively documented, so parse
 * defensively. Verify the real key during the Khaya smoke test and lock it in.
 */
export async function khayaTranscribe(
  audio: Buffer,
  language: string = ASR_LANGUAGE
): Promise<string> {
  try {
    const data = await withRetry(async () => {
      const res = await axios.post(
        // ASR v3 — faster + accurate; returns {"text":"..."}
        `${BASE_URL}/asr/v3/transcribe?language=${encodeURIComponent(language)}`,
        audio,
        {
          headers: { ...authHeader(), "Content-Type": "audio/mpeg" },
          responseType: "json",
          timeout: 15000,
          maxBodyLength: Infinity,
        }
      );
      return res.data as unknown;
    });

    const transcript =
      (data && typeof data === "object"
        ? (data as any).transcription ??
          (data as any).transcript ??
          (data as any).text ??
          (data as any).result
        : undefined) ?? (typeof data === "string" ? data : "");

    return typeof transcript === "string" ? transcript.trim() : "";
  } catch (err: any) {
    logger.warn("Khaya ASR transcription failed", {
      error: err.message,
      metadata: { language, status: err?.response?.status },
    });
    return "";
  }
}

export interface KhayaSynthesizeOptions {
  language?: string;
  speakerId?: string;
}

/**
 * Synthesize speech. Returns WAV bytes (~16 kHz mono). Throws on failure so the
 * caller (custom-voice route) can return a silence fallback.
 */
export async function khayaSynthesize(
  text: string,
  opts: KhayaSynthesizeOptions = {}
): Promise<Buffer> {
  // TTS v2 with stream:true returns 16-bit PCM WAV (~15x faster than v1 on
  // long text: ~3 s vs ~47 s). non-stream v2 returns float32 WAV — either way
  // stripWavHeader + decodeToInt16 normalizes it downstream.
  const body = {
    text,
    language: opts.language || TTS_LANGUAGE,
    speaker_id: opts.speakerId || DEFAULT_SPEAKER,
    stream: true,
    format: "wav",
  };

  const buf = await withRetry(async () => {
    const res = await axios.post(`${BASE_URL}/tts/v2/synthesize`, body, {
      headers: { ...authHeader(), "Content-Type": "application/json" },
      responseType: "arraybuffer",
      timeout: 20000,
    });
    return Buffer.from(res.data);
  });

  return buf;
}

/** GET /tts/v2/speakers — setup/dev helper to discover valid speaker_id values. */
export async function khayaListSpeakers(): Promise<unknown> {
  const res = await axios.get(`${BASE_URL}/tts/v2/speakers`, {
    headers: authHeader(),
    timeout: 10000,
  });
  return res.data;
}
