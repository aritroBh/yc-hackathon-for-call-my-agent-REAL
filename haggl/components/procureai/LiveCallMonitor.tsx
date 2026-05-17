"use client";

// Live Call Monitor — empty / skeleton state. Warm chrome kept; call rail
// and bilingual transcript render shimmer placeholders until wired.

import { Icon } from "./icons";
import { Skel, SkelCircle } from "./Skeleton";

function MiniStripSkel() {
  return (
    <div style={{ padding: "10px 10px", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
      <SkelCircle size={26} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Skel w="80%" h={11} />
        <Skel w={40} h={9} style={{ marginTop: 6 }} />
      </div>
      <SkelCircle size={7} />
    </div>
  );
}

function TranscriptLineSkel() {
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
        <Skel w={70} h={10} />
        <Skel w="92%" h={12} style={{ marginTop: 8 }} />
        <Skel w="64%" h={12} style={{ marginTop: 6 }} />
      </div>
      <div>
        <Skel w={20} h={10} />
        <Skel w="88%" h={12} style={{ marginTop: 8 }} />
        <Skel w="58%" h={12} style={{ marginTop: 6 }} />
      </div>
    </div>
  );
}

export function LiveCallMonitor() {
  return (
    <div className="pa-screen pa">
      <div className="pa-topbar">
        <div className="brand">
          <div className="brand-mark">p</div>
          <span>ProcureAI</span>
        </div>
        <div className="crumbs">
          <Skel w={80} h={11} />
          <span className="sep">/</span>
          <Skel w={90} h={11} />
          <span className="sep">/</span>
          <Skel w={110} h={11} />
        </div>
        <div className="spacer" />
        <Skel w={150} h={24} r={6} />
        <SkelCircle size={26} />
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
            <Skel w={56} h={10} />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <MiniStripSkel key={i} />
          ))}
        </div>

        {/* main column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
          {/* call header */}
          <div style={{ padding: "24px 36px 16px", borderBottom: "1px solid var(--line-2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <SkelCircle size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Skel w={180} h={14} />
                <Skel w={140} h={11} style={{ marginTop: 6 }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div className="pa-wave idle" style={{ height: 28 }}>
                  {Array.from({ length: 14 }).map((_, i) => (
                    <i key={i} style={{ width: 2.5 }} />
                  ))}
                </div>
                <Skel w={56} h={18} />
                <div style={{ width: 1, height: 22, background: "var(--line)", margin: "0 4px" }} />
                <Skel w={72} h={30} r={8} />
                <Skel w={30} h={30} r={8} />
                <Skel w={30} h={30} r={8} />
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
              <Skel w={120} h={10} />
              <Skel w={130} h={10} />
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <TranscriptLineSkel key={i} />
            ))}
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
              <Icon.Sparkle size={13} color="var(--ink-4)" />
              <Skel w={260} h={11} />
              <div style={{ flex: 1 }} />
              <Skel w={100} h={20} r={6} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
