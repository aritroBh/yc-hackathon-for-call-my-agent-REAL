"use client";

// Live Call Monitor — ported from the Claude Design handoff
// (yc-hack/project/artboard-livecall.jsx). Slim call rail + bilingual
// streaming transcript (the star) + whisper-to-agent input.

import { Icon } from "./icons";
import { Popover } from "./Popover";
import { SUPPLIERS, type Supplier, type CallState } from "./data";

function MiniCallStrip({
  supplier,
  state,
  active,
}: {
  supplier: Supplier;
  state: CallState;
  active?: boolean;
}) {
  const dotColor =
    state === "live"
      ? "var(--clay-500)"
      : state === "ringing"
        ? "var(--amber-500)"
        : "var(--green-500)";
  return (
    <div
      style={{
        padding: "10px 10px",
        borderRadius: 8,
        border: "1px solid " + (active ? "var(--clay-500)" : "transparent"),
        background: active ? "var(--clay-50)" : "transparent",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 10,
        position: "relative",
      }}
    >
      <div className="pa-flag" style={{ background: supplier.color, width: 26, height: 26, fontSize: 11, flexShrink: 0 }}>
        {supplier.initial}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 500,
            color: "var(--ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {supplier.name}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {state === "live"
            ? "04:18"
            : state === "completed"
              ? supplier.callDuration
              : state === "ringing"
                ? "Dialing…"
                : "—"}
        </div>
      </div>
      <span
        className={state === "live" ? "pa-pulse" : ""}
        style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0 }}
      />
    </div>
  );
}

function TranscriptLine({
  speaker,
  originalText,
  englishText,
  time,
  streaming,
  supplier,
}: {
  speaker: "agent" | "supplier";
  originalText: string;
  englishText: string;
  time: string;
  streaming?: boolean;
  supplier: Supplier;
}) {
  const isAgent = speaker === "agent";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 24,
        padding: "14px 0",
        borderBottom: "1px solid var(--line-2)",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          {isAgent ? (
            <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ink)" }}>Agent</span>
          ) : (
            <span style={{ fontSize: 11.5, fontWeight: 500, color: supplier.color }}>{supplier.contact}</span>
          )}
          <span className="pa-mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>
            {time}
          </span>
        </div>
        <div className={streaming ? "pa-caret" : ""} style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.55 }}>
          {originalText}
        </div>
      </div>
      <div style={{ paddingLeft: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span className="pa-eyebrow" style={{ fontSize: 9.5 }}>
            EN
          </span>
        </div>
        <div
          style={{
            fontSize: 14,
            color: "var(--ink-2)",
            lineHeight: 1.55,
            fontStyle: streaming ? "italic" : "normal",
          }}
        >
          {englishText}
        </div>
      </div>
    </div>
  );
}

function ExtractedTermsPopover() {
  const rows: [string, string, boolean?][] = [
    ["Quoted price", "$1.82 / kg", true],
    ["MOQ", "10,000 kg"],
    ["Lead time", "14 days"],
    ["Payment", "30 / 70"],
    ["Incoterm", "FOB Chennai"],
    ["Certifications", "GOTS, ISO 9001"],
  ];
  return (
    <div style={{ padding: 16, width: 320 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span className="pa-eyebrow">Extracted live</span>
        <span style={{ fontSize: 10.5, color: "var(--clay-600)", display: "flex", alignItems: "center", gap: 4 }}>
          <Icon.Sparkle size={10} /> updating
        </span>
      </div>

      {rows.map(([k, v, fresh]) => (
        <div
          key={k}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "8px 10px",
            borderRadius: 6,
            background: fresh ? "var(--clay-50)" : "transparent",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{k}</span>
          <span className="pa-num" style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink)" }}>
            {v}
          </span>
        </div>
      ))}

      <div style={{ borderTop: "1px solid var(--line-2)", marginTop: 12, paddingTop: 12 }}>
        <div className="pa-eyebrow" style={{ marginBottom: 8, fontSize: 9.5 }}>
          Vs brief
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.6 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Target $1.80</span>
            <span style={{ color: "var(--amber-600)" }}>+$0.02</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Walk-away $2.20</span>
            <span style={{ color: "var(--green-600)" }}>$0.38 under</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentThinkingPopover() {
  return (
    <div style={{ padding: 16, width: 340 }}>
      <div className="pa-eyebrow" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon.Sparkle size={11} color="var(--clay-500)" /> Agent thinking
      </div>
      <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>
        Surat already at{" "}
        <span className="pa-num" style={{ fontWeight: 500, color: "var(--ink)" }}>
          $1.74
        </span>{" "}
        with same certs (GOTS, ISO 9001, OEKO-TEX). Will counter Coimbatore with $1.78 and ask for 50/50 payment terms.
      </div>
      <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--ink-4)", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--clay-500)" }} className="pa-pulse" />
        Reasoning over 4 transcripts
      </div>
    </div>
  );
}

export function LiveCallMonitor() {
  const live = SUPPLIERS[1];

  return (
    <div className="pa-screen pa">
      <div className="pa-topbar">
        <div className="brand">
          <div className="brand-mark">p</div>
          <span>ProcureAI</span>
        </div>
        <div className="crumbs">
          <span>Procurements</span>
          <span className="sep">/</span>
          <span>Raw cotton</span>
          <span className="sep">/</span>
          <b>Live call monitor</b>
        </div>
        <div className="spacer" />
        <div className="pa-chip clay" style={{ height: 24 }}>
          <span className="pa-pulse" style={{ width: 5, height: 5 }} />
          1 live · 2 done · 1 ringing
        </div>
        <div className="avatar">EH</div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* slim call rail */}
        <div
          style={{
            width: 220,
            borderRight: "1px solid var(--line)",
            background: "var(--paper)",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            overflow: "auto",
          }}
        >
          <div style={{ padding: "4px 6px 10px" }}>
            <div className="pa-eyebrow">Calls · 4</div>
          </div>
          <MiniCallStrip supplier={SUPPLIERS[1]} state="live" active />
          <MiniCallStrip supplier={SUPPLIERS[0]} state="completed" />
          <MiniCallStrip supplier={SUPPLIERS[2]} state="completed" />
          <MiniCallStrip supplier={SUPPLIERS[3]} state="ringing" />
        </div>

        {/* main column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
          {/* call header */}
          <div style={{ padding: "24px 36px 16px", borderBottom: "1px solid var(--line-2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div className="pa-flag" style={{ background: live.color, width: 40, height: 40, fontSize: 16, flexShrink: 0 }}>
                {live.initial}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.2, marginBottom: 2, letterSpacing: "-0.005em" }}>
                  {live.name}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{live.contact} · speaking Tamil</div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div className="pa-wave" style={{ height: 28 }}>
                  {Array.from({ length: 14 }).map((_, i) => (
                    <i key={i} style={{ animationDelay: `${i * 0.06}s`, width: 2.5 }} />
                  ))}
                </div>
                <span className="pa-mono pa-num" style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em" }}>
                  04:18
                </span>

                <div style={{ width: 1, height: 22, background: "var(--line)", margin: "0 4px" }} />

                <Popover
                  align="right"
                  width={320}
                  trigger={
                    <button className="pa-btn pa-btn-ghost" style={{ height: 30, padding: "0 10px", color: "var(--ink-2)" }}>
                      <Icon.Sparkle size={12} color="var(--clay-500)" /> Terms
                      <span
                        style={{
                          background: "var(--clay-500)",
                          color: "#fff",
                          borderRadius: 4,
                          padding: "1px 5px",
                          fontSize: 10,
                          fontWeight: 500,
                        }}
                      >
                        6
                      </span>
                    </button>
                  }
                >
                  <ExtractedTermsPopover />
                </Popover>

                <button className="pa-btn" style={{ width: 30, padding: 0, justifyContent: "center" }} title="Mute">
                  <Icon.Mic size={12} />
                </button>
                <button
                  className="pa-btn"
                  style={{
                    background: "var(--red-50)",
                    color: "var(--red-500)",
                    borderColor: "rgba(181,67,43,0.2)",
                    width: 30,
                    padding: 0,
                    justifyContent: "center",
                  }}
                  title="End call"
                >
                  <Icon.PhoneOff size={12} />
                </button>
              </div>
            </div>
          </div>

          {/* transcript */}
          <div style={{ flex: 1, overflow: "auto", padding: "8px 36px 0" }}>
            <div
              style={{
                position: "sticky",
                top: 0,
                background: "var(--surface)",
                zIndex: 1,
                padding: "14px 0 10px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 24,
              }}
            >
              <div className="pa-eyebrow">Tamil — original</div>
              <div className="pa-eyebrow">English — translated</div>
            </div>

            <TranscriptLine
              speaker="agent"
              supplier={live}
              time="00:12"
              originalText="வணக்கம், என் பெயர் ProcureAI agent. நாங்கள் 10,000 கிலோ Grade A பருத்தி வாங்க விரும்புகிறோம்."
              englishText="Hello, I'm calling on behalf of a US buyer. We're looking to source 10,000 kg of Grade A raw cotton."
            />
            <TranscriptLine
              speaker="supplier"
              supplier={live}
              time="00:31"
              originalText="நல்லது. எங்களுக்கு கொத்தாக கிடைக்கும். எங்கள் விலை கிலோவுக்கு $1.95."
              englishText="Sure, we have that in stock. Our standard price is $1.95 per kilo for that grade."
            />
            <TranscriptLine
              speaker="agent"
              supplier={live}
              time="01:08"
              originalText="அதை சற்று குறைக்க முடியுமா? நாங்கள் $1.80 இலக்கு வைத்துள்ளோம், மற்றும் GOTS certification தேவைப்படுகிறது."
              englishText="Could you do better than that? Our target is $1.80, and we'd need GOTS certification confirmed."
            />
            <TranscriptLine
              speaker="supplier"
              supplier={live}
              time="02:24"
              originalText="GOTS certified நாங்கள்தான். 10,000 கிலோ ஆனால், $1.85 க்கு வரலாம். MOQ 10,000."
              englishText="We are GOTS certified, yes. For a 10,000 kg order, we could come down to $1.85. Our MOQ stays at 10,000."
            />
            <TranscriptLine
              speaker="agent"
              supplier={live}
              time="03:12"
              originalText="Lead time எவ்வளவு? Payment terms — நாங்கள் 50/50 முன்பணம் கொடுக்க விரும்புகிறோம்."
              englishText="What's the lead time? On payment — we'd prefer 50% advance, 50% on shipment."
            />
            <TranscriptLine
              speaker="supplier"
              supplier={live}
              time="03:48"
              streaming
              originalText="14 நாட்கள் lead time. Payment terms 30/70 — 30% advance, 70% on bill of lading. அதனால் நாங்கள் 1.82 க்கு வரலாம்…"
              englishText="14 days lead time. On payment we'd want 30/70 — 30% advance and 70% on the bill of lading. With that we can do $1.82…"
            />
            <div style={{ height: 30 }} />
          </div>

          {/* whisper input */}
          <div style={{ borderTop: "1px solid var(--line-2)", padding: "12px 36px 16px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "var(--paper)",
                borderRadius: 10,
                border: "1px solid var(--line)",
                padding: "9px 14px",
              }}
            >
              <Icon.Sparkle size={13} color="var(--clay-500)" />
              <div style={{ fontSize: 12.5, color: "var(--ink-3)", flex: 1 }}>
                Whisper to agent — inject an instruction mid-call
              </div>
              <Popover
                align="right"
                width={340}
                trigger={
                  <button
                    className="pa-btn pa-btn-ghost"
                    style={{ height: 26, padding: "0 8px", color: "var(--ink-3)", fontSize: 11.5 }}
                  >
                    <Icon.Sparkle size={11} color="var(--clay-500)" /> Agent thinking
                  </button>
                }
              >
                <AgentThinkingPopover />
              </Popover>
              <span
                className="pa-mono"
                style={{
                  fontSize: 10.5,
                  color: "var(--ink-4)",
                  background: "var(--surface-inset)",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                ⏎
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
