"use client";

// Procurement Overview (dashboard) — ported from the Claude Design handoff
// (yc-hack/project/artboard-overview.jsx). Compact page header, KPI strip,
// supplier call list. No display serifs.

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { Popover } from "./Popover";
import { SUPPLIERS, BRIEF, type Supplier, type CallState } from "./data";

function TopBar({ crumbs }: { crumbs: string[] }) {
  return (
    <div className="pa-topbar">
      <div className="brand">
        <div className="brand-mark">p</div>
        <span>ProcureAI</span>
      </div>
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {i > 0 && <span className="sep">/</span>}
            {i === crumbs.length - 1 ? <b>{c}</b> : <span>{c}</span>}
          </span>
        ))}
      </div>
      <div className="spacer" />
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-3)", fontSize: 12.5 }}>
        <Icon.Search size={14} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>⌘K</span>
      </div>
      <div className="avatar">EH</div>
    </div>
  );
}

function SideRail({ active }: { active: string }) {
  const items: { id: string; icon: ReactNode }[] = [
    { id: "home", icon: <Icon.Home /> },
    { id: "phone", icon: <Icon.Phone /> },
    { id: "inbox", icon: <Icon.Inbox /> },
    { id: "search", icon: <Icon.Search /> },
    { id: "users", icon: <Icon.Users /> },
  ];
  return (
    <div className="pa-rail">
      {items.map((it) => (
        <div key={it.id} className={`item ${it.id === active ? "active" : ""}`}>
          {it.icon}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div className="item">
        <Icon.Cog />
      </div>
    </div>
  );
}

function CallRow({
  supplier,
  state,
  onOpen,
}: {
  supplier: Supplier;
  state: CallState;
  onOpen: () => void;
}) {
  const dotColor =
    state === "live"
      ? "var(--clay-500)"
      : state === "ringing"
        ? "var(--amber-500)"
        : state === "queued"
          ? "var(--ink-4)"
          : "var(--green-500)";
  const stateLabel =
    state === "live"
      ? "On call"
      : state === "ringing"
        ? "Ringing"
        : state === "queued"
          ? "Queued"
          : "Completed";
  return (
    <tr>
      <td style={{ width: 24, paddingRight: 0 }}>
        <div className="pa-flag" style={{ background: supplier.color, width: 24, height: 24, fontSize: 11 }}>
          {supplier.initial}
        </div>
      </td>
      <td style={{ fontWeight: 500 }}>{supplier.name}</td>
      <td style={{ color: "var(--ink-3)" }}>
        {supplier.city}, {supplier.region}
      </td>
      <td style={{ color: "var(--ink-3)" }}>{supplier.language}</td>
      <td>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
          <span
            className={state === "live" ? "pa-pulse" : ""}
            style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, display: "inline-block" }}
          />
          {stateLabel}
        </span>
      </td>
      <td style={{ minWidth: 140 }}>
        {state === "live" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="pa-wave" style={{ height: 16 }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <i key={i} style={{ animationDelay: `${i * 0.06}s`, width: 2 }} />
              ))}
            </div>
            <span className="pa-mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
              04:18
            </span>
          </div>
        )}
        {state === "completed" && (
          <span className="pa-mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {supplier.callDuration}
          </span>
        )}
        {state === "ringing" && (
          <span style={{ fontSize: 12, color: "var(--amber-600)" }}>Dialing… attempt 3</span>
        )}
      </td>
      <td className="pa-num" style={{ fontWeight: 500 }}>
        {state === "completed" || state === "live" ? `$${supplier.priceUsd.toFixed(2)}` : "—"}
        {(state === "completed" || state === "live") && (
          <span style={{ color: "var(--ink-3)", fontWeight: 400, fontSize: 11.5 }}> /kg</span>
        )}
      </td>
      <td style={{ textAlign: "right" }}>
        <button
          onClick={onOpen}
          className="pa-btn pa-btn-ghost"
          style={{ height: 26, padding: "0 8px", fontSize: 11.5, color: "var(--ink-3)" }}
        >
          {state === "live" ? "Listen in" : state === "completed" ? "Transcript" : "Details"}{" "}
          <Icon.ArrowRight size={11} />
        </button>
      </td>
    </tr>
  );
}

function Row({ k, v, highlight }: { k: string; v: ReactNode; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", gap: 12 }}>
      <span style={{ color: "var(--ink-3)" }}>{k}</span>
      <span style={{ color: highlight ? "var(--clay-700)" : "var(--ink)", fontWeight: highlight ? 500 : 400, textAlign: "right" }}>
        {v}
      </span>
    </div>
  );
}

function BriefPopover() {
  return (
    <div style={{ padding: 18 }}>
      <div className="pa-eyebrow" style={{ marginBottom: 10 }}>
        Procurement brief
      </div>
      <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>
        <Row k="Product" v="Traditional woven kente fabric (48in)" />
        <Row k="Region" v="West Africa (Ghana / Nigeria)" />
        <Row k="Quantity" v="5,000 yards" />
        <Row k="Target price" v="$8.50 / yard" highlight />
        <Row k="Walk-away" v="$10.00 / yard" />
        <Row k="Deadline" v={BRIEF.deadline} />
        <Row k="Negotiation" v="Balanced" />
      </div>
      <div style={{ borderTop: "1px solid var(--line-2)", marginTop: 14, paddingTop: 12, fontSize: 11.5, color: "var(--ink-3)" }}>
        Submitted by Eshan H. · 09:02
      </div>
    </div>
  );
}

function ActivityPopover() {
  const items: { time: string; accent: string | null; text: ReactNode }[] = [
    { time: "09:42", accent: "var(--clay-500)", text: <>Placed call to <b>Kofi Textiles Ltd</b> in Twi (Accra, Ghana).</> },
    { time: "09:38", accent: "var(--green-500)", text: <>Live intel fired: Moss flagged kente price anchor $10/yd vs market $8.40/yd.</> },
    { time: "09:31", accent: null, text: <>Completed call with Adebayo Manufacturing in Yoruba. Deal at $9.50/unit.</> },
    { time: "09:22", accent: null, text: <>Placed call to Ghana Agro Exports in Akan (Kumasi).</> },
    { time: "09:18", accent: null, text: <>Browser Use: researched Kofi Textiles — AGOA certified, GSA mark holder.</> },
    { time: "09:04", accent: null, text: <>Supermemory: prior Kofi deal at $8.40/yd loaded into negotiation context.</> },
  ];
  return (
    <div style={{ padding: "14px 4px 8px" }}>
      <div style={{ padding: "0 14px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="pa-eyebrow">Agent activity</span>
        <span className="pa-mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>
          live
        </span>
      </div>
      <div style={{ maxHeight: 320, overflow: "auto" }}>
        {items.map((it, i) => (
          <div
            key={i}
            style={{ display: "grid", gridTemplateColumns: "44px 14px 1fr", gap: 8, padding: "9px 14px", alignItems: "flex-start" }}
          >
            <div className="pa-mono" style={{ fontSize: 10.5, color: "var(--ink-4)", paddingTop: 3 }}>
              {it.time}
            </div>
            <div style={{ paddingTop: 5 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: it.accent || "var(--ink-4)",
                  boxShadow: it.accent ? `0 0 0 3px ${it.accent}22` : "none",
                }}
              />
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{it.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProcurementOverview() {
  const router = useRouter();
  const [demoLoading, setDemoLoading] = useState(false);
  const [rlLoading, setRlLoading] = useState(false);
  const [rlResult, setRlResult] = useState<string | null>(null);

  const runDemo = async () => {
    setDemoLoading(true);
    try {
      const r = await fetch("/api/demo/seed", { method: "POST" });
      const d = await r.json();
      if (d.rfqId) router.push(`/rfq/${d.rfqId}/monitor`);
    } finally {
      setDemoLoading(false);
    }
  };

  const runRL = async () => {
    setRlLoading(true);
    try {
      const r = await fetch("/api/rl/run", { method: "POST" });
      const d = await r.json();
      setRlResult(
        d.message || `RL complete — ${d.newlyAnalyzedCount ?? 0} call(s) analyzed`,
      );
    } finally {
      setRlLoading(false);
    }
  };

  const openMonitor = () => router.push("/rfq/demo/monitor");

  return (
    <div className="pa-screen pa">
      <TopBar crumbs={["Procurements", "PR-2614 · Raw cotton"]} />
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <SideRail active="home" />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* dashboard page header */}
          <div className="pa-page-head">
            <div style={{ flex: 1 }}>
              <div className="pa-page-title">
                <span>Raw cotton, Grade A</span>
                <span className="pa-chip clay" style={{ height: 20, fontSize: 10.5 }}>
                  <span className="pa-pulse" style={{ width: 5, height: 5 }} />
                  Calling
                </span>
              </div>
              <div className="pa-page-sub" style={{ marginTop: 4 }}>
                PR-2614 · West Africa (Ghana / Nigeria) · deadline {BRIEF.deadline}
              </div>
            </div>

            <div className="flex gap-2 items-center">
              <button
                onClick={runDemo}
                disabled={demoLoading}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-xs font-mono text-white disabled:opacity-50"
              >
                {demoLoading ? "Starting…" : "▶ Run Demo"}
              </button>
              <button
                onClick={runRL}
                disabled={rlLoading}
                className="px-3 py-1.5 border border-emerald-700 hover:border-emerald-500 text-emerald-400 rounded text-xs font-mono disabled:opacity-50"
              >
                {rlLoading ? "Running…" : "⟳ Optimize Agent"}
              </button>
              {rlResult && (
                <span className="text-xs text-slate-400 self-center max-w-[220px] truncate" title={rlResult}>
                  {rlResult}
                </span>
              )}
            </div>

            <Popover
              width={300}
              trigger={
                <button className="pa-btn pa-btn-ghost" style={{ height: 30, color: "var(--ink-2)" }}>
                  <Icon.Inbox size={13} /> Activity
                  <span
                    style={{
                      background: "var(--clay-500)",
                      color: "#fff",
                      borderRadius: 4,
                      padding: "1px 5px",
                      fontSize: 10,
                      fontWeight: 500,
                      marginLeft: 2,
                    }}
                  >
                    6
                  </span>
                </button>
              }
            >
              <ActivityPopover />
            </Popover>

            <Popover
              width={320}
              trigger={
                <button className="pa-btn pa-btn-ghost" style={{ height: 30, color: "var(--ink-2)" }}>
                  Brief
                </button>
              }
            >
              <BriefPopover />
            </Popover>

            <button className="pa-btn pa-btn-ghost" style={{ height: 30, color: "var(--ink-2)" }}>
              <Icon.Plus size={13} /> Supplier
            </button>
          </div>

          {/* KPI strip */}
          <div style={{ padding: "20px 28px 0", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <div className="pa-kpi">
              <div className="label">Calls dispatched</div>
              <div className="value">
                4<span className="suffix">/4</span>
              </div>
              <div className="sub">1 live · 2 done · 1 ringing</div>
            </div>
            <div className="pa-kpi">
              <div className="label">Best quote so far</div>
              <div className="value">
                $1.74<span className="suffix">/kg</span>
              </div>
              <div className="sub" style={{ color: "var(--green-600)" }}>
                −$0.06 vs target
              </div>
            </div>
            <div className="pa-kpi">
              <div className="label">Time elapsed</div>
              <div className="value">
                28<span className="suffix">min</span>
              </div>
              <div className="sub">est. 12 min remaining</div>
            </div>
            <div className="pa-kpi">
              <div className="label">Languages</div>
              <div className="value">3</div>
              <div className="sub">TWI · YOR · AKAN</div>
            </div>
          </div>

          {/* call list */}
          <div style={{ padding: "24px 28px", flex: 1, overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>Suppliers in call</span>
                <div className="pa-tabs">
                  <button className="active">All · 4</button>
                  <button>Live · 1</button>
                  <button>Done · 2</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div className="pa-input-wrap">
                  <Icon.Search size={12} />
                  <input className="pa-input" placeholder="Search suppliers" />
                </div>
                <button className="pa-btn" onClick={openMonitor}>
                  Open call monitor <Icon.ArrowRight size={11} />
                </button>
              </div>
            </div>

            <div className="pa-card" style={{ overflow: "hidden" }}>
              <table className="pa-table">
                <thead>
                  <tr>
                    <th style={{ width: 24 }}></th>
                    <th>Supplier</th>
                    <th>Location</th>
                    <th>Language</th>
                    <th>Status</th>
                    <th>Activity</th>
                    <th>Quote</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  <CallRow supplier={SUPPLIERS[1]} state="live" onOpen={openMonitor} />
                  <CallRow supplier={SUPPLIERS[0]} state="completed" onOpen={openMonitor} />
                  <CallRow supplier={SUPPLIERS[2]} state="completed" onOpen={openMonitor} />
                  <CallRow supplier={SUPPLIERS[3]} state="ringing" onOpen={openMonitor} />
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 16, fontSize: 12, color: "var(--ink-4)", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon.Sparkle size={12} color="var(--clay-500)" />
              Agent will surface a deal review once all 4 calls complete.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
