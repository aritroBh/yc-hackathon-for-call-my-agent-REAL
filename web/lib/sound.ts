/**
 * Tiny synthesized "go" cue for the magic moment. No audio asset shipped.
 * MUST be called from a user gesture (click) so browser autoplay policy
 * is satisfied. Silently no-ops if Web Audio is unavailable.
 */
export function playDealCue(): void {
  if (typeof window === "undefined") return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    // Two soft, warm notes — a confident little upward step.
    [
      { f: 392, t: 0 },
      { f: 587.33, t: 0.12 },
    ].forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.12, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.24);
    });

    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    /* no-op */
  }
}
