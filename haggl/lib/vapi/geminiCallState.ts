/**
 * Per-call Gemini Live session state store.
 *
 * Lives in the express-bridge process. Stores audio + text output from Gemini
 * Live sessions keyed by haggl call ID, with async waiter support so the Vapi
 * custom-voice HTTP endpoint can block briefly until the audio is ready.
 *
 * Exported functions used by:
 *   - transcriberSocket.ts  (write: init / push / close)
 *   - express-bridge.mjs    (read: popAudio, popText for HTTP endpoints)
 */

export interface GeminiCallEntry {
  audioChunks: Buffer[];
  textChunks: string[];
  audioWaiters: Array<(buf: Buffer) => void>;
  textWaiters: Array<(txt: string) => void>;
  ttl: ReturnType<typeof setTimeout>;
  closed: boolean;
}

const store = new Map<string, GeminiCallEntry>();
const TTL_MS = 10 * 60 * 1000; // 10 min auto-cleanup

function makeEntry(): GeminiCallEntry {
  return {
    audioChunks: [],
    textChunks: [],
    audioWaiters: [],
    textWaiters: [],
    ttl: setTimeout(() => {}, 0),
    closed: false,
  };
}

function resetTTL(callId: string, entry: GeminiCallEntry): void {
  clearTimeout(entry.ttl);
  entry.ttl = setTimeout(() => closeGeminiCallState(callId), TTL_MS);
}

export function initGeminiCallState(callId: string): void {
  const existing = store.get(callId);
  if (existing) {
    clearTimeout(existing.ttl);
    existing.closed = true;
    existing.audioWaiters.splice(0).forEach((r) => r(Buffer.alloc(0)));
    existing.textWaiters.splice(0).forEach((r) => r(""));
  }
  const entry = makeEntry();
  store.set(callId, entry);
  resetTTL(callId, entry);
}

export function pushGeminiAudio(callId: string, audio: Buffer): void {
  const entry = store.get(callId);
  if (!entry || entry.closed || !audio.length) return;
  entry.audioChunks.push(audio);
  resetTTL(callId, entry);
  if (entry.audioWaiters.length) {
    const combined = Buffer.concat(entry.audioChunks.splice(0));
    entry.audioWaiters.splice(0).forEach((r) => r(combined));
  }
}

export function pushGeminiText(callId: string, text: string): void {
  const entry = store.get(callId);
  if (!entry || entry.closed || !text.trim()) return;
  entry.textChunks.push(text);
  resetTTL(callId, entry);
  if (entry.textWaiters.length) {
    const combined = entry.textChunks.splice(0).join(" ");
    entry.textWaiters.splice(0).forEach((r) => r(combined));
  }
}

export function popGeminiAudio(callId: string, timeoutMs = 3000): Promise<Buffer | null> {
  return new Promise<Buffer | null>((resolve) => {
    const entry = store.get(callId);
    if (!entry || entry.closed) {
      resolve(null);
      return;
    }
    if (entry.audioChunks.length) {
      resolve(Buffer.concat(entry.audioChunks.splice(0)));
      return;
    }
    const timer = setTimeout(() => {
      const idx = entry.audioWaiters.indexOf(waiter);
      if (idx >= 0) entry.audioWaiters.splice(idx, 1);
      resolve(null);
    }, timeoutMs);
    const waiter = (buf: Buffer): void => {
      clearTimeout(timer);
      resolve(buf.length ? buf : null);
    };
    entry.audioWaiters.push(waiter);
  });
}

export function popGeminiText(callId: string, timeoutMs = 3000): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const entry = store.get(callId);
    if (!entry || entry.closed) {
      resolve(null);
      return;
    }
    if (entry.textChunks.length) {
      resolve(entry.textChunks.splice(0).join(" "));
      return;
    }
    const timer = setTimeout(() => {
      const idx = entry.textWaiters.indexOf(waiter);
      if (idx >= 0) entry.textWaiters.splice(idx, 1);
      resolve(null);
    }, timeoutMs);
    const waiter = (txt: string): void => {
      clearTimeout(timer);
      resolve(txt || null);
    };
    entry.textWaiters.push(waiter);
  });
}

export function hasGeminiSession(callId: string): boolean {
  return store.has(callId) && !(store.get(callId)?.closed ?? true);
}

export function closeGeminiCallState(callId: string): void {
  const entry = store.get(callId);
  if (!entry) return;
  clearTimeout(entry.ttl);
  entry.closed = true;
  entry.audioWaiters.splice(0).forEach((r) => r(Buffer.alloc(0)));
  entry.textWaiters.splice(0).forEach((r) => r(""));
  store.delete(callId);
}
