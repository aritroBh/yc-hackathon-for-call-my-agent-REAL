/**
 * haggl is HEADLESS. The buyer-facing UI is the standalone `web/`
 * (Atlas) app. This service exposes `/api/**` only — notably
 * `POST /api/research` (Gemini Deep Research, called by web/ via its
 * /api/plan/research proxy), plus the voice-negotiation engine,
 * dispatch and workers. Inline styles only — no CSS dependency.
 */
export default function Headless() {
  return (
    <main
      style={{
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        maxWidth: 620,
        margin: "0 auto",
        padding: "64px 24px",
        lineHeight: 1.65,
      }}
    >
      <h1 style={{ fontSize: 18, margin: "0 0 10px" }}>
        haggl · headless backend
      </h1>
      <p style={{ fontSize: 14, opacity: 0.75, margin: 0 }}>
        No UI here. The buyer-facing app is the standalone <code>web/</code>{" "}
        (Atlas) frontend. This service exposes the API only — including{" "}
        <code>POST /api/research</code> (Gemini Deep Research), the
        voice-negotiation engine and workers.
      </p>
    </main>
  );
}
