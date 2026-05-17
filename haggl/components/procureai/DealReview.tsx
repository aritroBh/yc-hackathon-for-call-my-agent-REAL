"use client";

// Deal Review (the hero) — ported from the Claude Design handoff
// (yc-hack/project/artboard-review.jsx). List + inspector pattern: compact
// page head, KPI strip, filter bar, ranked data table with the recommended
// supplier pre-selected, and a right inspector showing the AI reasoning.

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "./icons";
import { Popover } from "./Popover";
import { SUPPLIERS, BRIEF, type Supplier } from "./data";

function priceToPct(price: number, min: number, max: number) {
  return ((price - min) / (max - min)) * 100;
}

function MiniPriceBar({
  supplier,
  min,
  max,
  target,
  walkaway,
  recommended,
}: {
  supplier: Supplier;
  min: number;
  max: number;
  target: number;
  walkaway: number;
  recommended: boolean;
}) {
  const pct = priceToPct(supplier.priceUsd, min, max);
  const targetPct = priceToPct(target, min, max);
  const walkPct = priceToPct(walkaway, min, max);
  return (
    <div style={{ position: "relative", height: 16, width: 160 }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          height: 2,
          background: "var(--surface-inset)",
          borderRadius: 4,
          transform: "translateY(-50%)",
        }}
      />
      <div style={{ position: "absolute", left: `${targetPct}%`, top: 1, bottom: 1, width: 1, background: "var(--green-500)", opacity: 0.5 }} />
      <div style={{ position: "absolute", left: `${walkPct}%`, top: 1, bottom: 1, width: 1, background: "var(--red-500)", opacity: 0.5 }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: "50%",
          height: 2,
          width: `${pct}%`,
          background: recommended ? "var(--green-500)" : "var(--clay-500)",
          borderRadius: 4,
          transform: "translateY(-50%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: `${pct}%`,
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: "#fff",
          border: `2px solid ${recommended ? "var(--green-500)" : "var(--clay-500)"}`,
        }}
      />
    </div>
  );
}

function SentimentPill({ value }: { value: Supplier["sentiment"] }) {
  const styles = {
    positive: { bg: "var(--green-50)", color: "var(--green-600)", label: "Positive" },
    neutral: { bg: "var(--surface-inset)", color: "var(--ink-2)", label: "Neutral" },
    negative: { bg: "var(--red-50)", color: "var(--red-500)", label: "Negative" },
  }[value];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        padding: "0 7px",
        height: 19,
        borderRadius: 4,
        background: styles.bg,
        color: styles.color,
        fontWeight: 500,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: styles.color }} />
      {styles.label}
    </span>
  );
}

function SortableTh({ children, active, dir = "asc" }: { children: ReactNode; active?: boolean; dir?: "asc" | "desc" }) {
  return (
    <th style={{ cursor: "pointer" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: active ? "var(--ink)" : "inherit" }}>
        {children}
        <svg width="9" height="9" viewBox="0 0 10 10" fill={active ? "currentColor" : "var(--ink-4)"}>
          {dir === "asc" ? <path d="M5 2 L8 7 L2 7 Z" /> : <path d="M5 8 L2 3 L8 3 Z" />}
        </svg>
      </span>
    </th>
  );
}

function FilterDropdown({ label, value }: { label: string; value: string }) {
  return (
    <button className="pa-btn" style={{ height: 30, padding: "0 10px", color: "var(--ink-2)", fontWeight: 400 }}>
      <span style={{ color: "var(--ink-3)" }}>{label}:</span>
      <span style={{ color: "var(--ink)", fontWeight: 500, marginLeft: 4 }}>{value}</span>
      <Icon.Chevron size={10} style={{ transform: "rotate(90deg)", color: "var(--ink-4)" }} />
    </button>
  );
}

function RunDetailsPopover() {
  const rows: [string, string][] = [
    ["Suppliers contacted", "4 / 31 shortlisted"],
    ["Languages used", "GU · TA · HI · MR"],
    ["Total call time", "38 min"],
    ["Transcript turns", "1,847"],
    ["Translation", "Khaya AI v3"],
    ["Stored to", "Supermemory"],
  ];
  return (
    <div style={{ padding: 16 }}>
      <div className="pa-eyebrow" style={{ marginBottom: 12 }}>
        Run details
      </div>
      {rows.map(([k, v]) => (
        <div
          key={k}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "7px 0",
            fontSize: 12.5,
            borderBottom: "1px solid var(--line-2)",
          }}
        >
          <span style={{ color: "var(--ink-3)" }}>{k}</span>
          <span style={{ color: "var(--ink)", fontWeight: 500 }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function Field({ k, v, accent, last }: { k: string; v: ReactNode; accent?: "green" | "amber"; last?: boolean }) {
  const color = accent === "green" ? "var(--green-600)" : accent === "amber" ? "var(--amber-600)" : "var(--ink)";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "7px 0",
        borderBottom: last ? "none" : "1px solid var(--line-2)",
        fontSize: 12.5,
        gap: 12,
      }}
    >
      <span style={{ color: "var(--ink-3)" }}>{k}</span>
      <span style={{ color, fontWeight: accent ? 500 : 400, textAlign: "right", fontFeatureSettings: '"tnum"' }}>{v}</span>
    </div>
  );
}

function ReasonPill({ label, sub, tag }: { label: string; sub: string; tag: "win" | "match" | "signal" }) {
  const c = {
    win: { bg: "var(--green-50)", color: "var(--green-600)" },
    match: { bg: "var(--clay-50)", color: "var(--clay-700)" },
    signal: { bg: "var(--surface-inset)", color: "var(--ink-2)" },
  }[tag];
  return (
    <div style={{ background: c.bg, padding: "10px 12px", borderRadius: 7, borderLeft: `2px solid ${c.color}` }}>
      <div style={{ fontSize: 12, color: c.color, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function CoTPopover() {
  const steps = [
    "Compared 4 quotes against target $1.80/kg and brief certs.",
    "Filtered for GOTS or OEKO-TEX — eliminated Indore (ISO 9001 only).",
    "Ranked remaining by total cost including payment timing.",
    "Surat: $17,400 at 50/50 split — best capital efficiency.",
    "Cross-checked sentiment + repeat-order signal from transcript.",
    "Confirmed lead time (12d) clears Jun 4 deadline by 11 days.",
  ];
  return (
    <div style={{ padding: 16, maxHeight: 360, overflow: "auto" }}>
      <div className="pa-eyebrow" style={{ marginBottom: 12 }}>
        Agent chain of thought
      </div>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 10, padding: "7px 0" }}>
          <span className="pa-mono" style={{ fontSize: 10.5, color: "var(--ink-4)", width: 18, flexShrink: 0 }}>
            {String(i + 1).padStart(2, "0")}
          </span>
          <span style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{s}</span>
        </div>
      ))}
    </div>
  );
}

function Inspector({ supplier, isRecommended }: { supplier: Supplier; isRecommended: boolean }) {
  return (
    <div
      style={{
        width: 360,
        borderLeft: "1px solid var(--line)",
        background: "var(--paper)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* header */}
      <div style={{ padding: "20px 22px 16px", borderBottom: "1px solid var(--line-2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span className="pa-eyebrow">Inspector</span>
          {isRecommended && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                padding: "0 6px",
                height: 18,
                borderRadius: 3,
                background: "var(--green-50)",
                color: "var(--green-600)",
                fontWeight: 500,
                letterSpacing: "0.02em",
              }}
            >
              <Icon.Star size={9} /> AGENT PICK
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="pa-flag" style={{ background: supplier.color, width: 36, height: 36, fontSize: 14, flexShrink: 0 }}>
            {supplier.initial}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.005em" }}>{supplier.name}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {supplier.city}, {supplier.region} · {supplier.language}
            </div>
          </div>
        </div>
      </div>

      {/* body */}
      <div style={{ flex: 1, overflow: "auto", padding: "18px 22px" }}>
        {/* offer */}
        <div className="pa-eyebrow" style={{ marginBottom: 10 }}>
          Offer
        </div>
        <div className="pa-card-inset" style={{ padding: 14, marginBottom: 18 }}>
          <Field k="Price" v={`$${supplier.priceUsd.toFixed(2)}/kg`} accent={supplier.priceUsd <= BRIEF.targetUsd ? "green" : "amber"} />
          <Field k="Order total" v={`$${(supplier.priceUsd * BRIEF.qty).toLocaleString()}`} />
          <Field k="MOQ" v={`${supplier.moq.toLocaleString()} kg`} />
          <Field k="Lead time" v={`${supplier.leadDays} days`} />
          <Field k="Payment" v={supplier.payment} />
          <Field k="Incoterm" v={supplier.incoterm} />
          <Field k="Certifications" v={supplier.certs.join(", ")} last />
        </div>

        {/* reasoning */}
        <div className="pa-eyebrow" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon.Sparkle size={11} color="var(--clay-500)" />
          {isRecommended ? "Why this is the pick" : "Why not this one"}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--ink-2)",
            lineHeight: 1.55,
            background: "var(--surface)",
            padding: 14,
            borderRadius: 8,
            border: "1px solid var(--line-2)",
            marginBottom: 14,
          }}
        >
          {supplier.summary}
        </div>

        {/* reason chips */}
        {isRecommended && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
            <ReasonPill label="Lowest price" sub="−$0.06 target" tag="win" />
            <ReasonPill label="All certs match" sub="GOTS · ISO · OEKO" tag="match" />
            <ReasonPill label="50/50 payment" sub="accepted" tag="match" />
            <ReasonPill label="Repeat discount" sub="volunteered" tag="signal" />
          </div>
        )}

        <Popover
          width={360}
          align="right"
          trigger={
            <button
              className="pa-btn pa-btn-ghost"
              style={{ width: "100%", height: 30, color: "var(--ink-3)", fontSize: 12, justifyContent: "flex-start" }}
            >
              <Icon.Sparkle size={11} color="var(--clay-500)" /> Show chain of thought
            </button>
          }
        >
          <CoTPopover />
        </Popover>

        <button
          className="pa-btn pa-btn-ghost"
          style={{ width: "100%", height: 30, color: "var(--ink-3)", fontSize: 12, justifyContent: "flex-start" }}
        >
          <Icon.Quote size={12} /> View call transcript ({supplier.callDuration})
        </button>
      </div>

      {/* footer actions */}
      <div style={{ padding: "14px 22px", borderTop: "1px solid var(--line)", background: "var(--surface)" }}>
        {isRecommended ? (
          <>
            <button
              className="pa-btn pa-btn-primary"
              style={{ width: "100%", height: 36, justifyContent: "center", marginBottom: 8 }}
            >
              Accept &amp; continue to payment <Icon.ArrowRight size={12} />
            </button>
            <button className="pa-btn" style={{ width: "100%", height: 30, justifyContent: "center", color: "var(--ink-2)" }}>
              Re-negotiate
            </button>
          </>
        ) : (
          <>
            <button className="pa-btn" style={{ width: "100%", height: 32, justifyContent: "center", marginBottom: 8 }}>
              Re-negotiate
            </button>
            <button
              className="pa-btn pa-btn-ghost"
              style={{ width: "100%", height: 28, justifyContent: "center", color: "var(--ink-3)", fontSize: 12 }}
            >
              Reject supplier
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function DealReview() {
  const router = useRouter();
  const sorted = [...SUPPLIERS].sort((a, b) => a.priceUsd - b.priceUsd);
  const [selectedId, setSelectedId] = useState(sorted[0].id);
  const selected = SUPPLIERS.find((s) => s.id === selectedId) as Supplier;
  const recommended = sorted[0];
  const min = 1.6;
  const max = 2.25;

  return (
    <div className="pa-screen pa">
      {/* topbar */}
      <div className="pa-topbar">
        <div className="brand">
          <div className="brand-mark">p</div>
          <span>ProcureAI</span>
        </div>
        <div className="crumbs">
          <span>Procurements</span>
          <span className="sep">/</span>
          <span>PR-2614 · Raw cotton</span>
          <span className="sep">/</span>
          <b>Deal review</b>
        </div>
        <div className="spacer" />
        <div className="pa-chip green" style={{ height: 24 }}>
          <Icon.CheckCircle size={11} /> 4/4 calls done
        </div>
        <div className="avatar">EH</div>
      </div>

      {/* dashboard layout */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* main column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {/* page header */}
          <div className="pa-page-head">
            <div style={{ flex: 1 }}>
              <div className="pa-page-title">Deal review</div>
              <div className="pa-page-sub" style={{ marginTop: 4 }}>
                4 suppliers · ranked by quote · completed {BRIEF.deadline.replace("2026", "")}, 38 min total
              </div>
            </div>

            <Popover
              width={280}
              align="right"
              trigger={
                <button className="pa-btn pa-btn-ghost" style={{ height: 30, color: "var(--ink-2)" }}>
                  <Icon.Sparkle size={12} color="var(--clay-500)" /> Run details
                </button>
              }
            >
              <RunDetailsPopover />
            </Popover>
            <button className="pa-btn pa-btn-ghost" style={{ height: 30, color: "var(--ink-2)" }}>
              Export CSV
            </button>
            <button className="pa-btn" style={{ height: 30 }} onClick={() => router.push("/rfq/demo/monitor")}>
              Replay transcripts
            </button>
          </div>

          {/* KPI strip */}
          <div style={{ padding: "20px 28px 0", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <div className="pa-kpi">
              <div className="label">Lowest quote</div>
              <div className="value">
                $1.74<span className="suffix">/kg</span>
              </div>
              <div className="sub" style={{ color: "var(--green-600)" }}>
                −$0.06 vs target $1.80
              </div>
            </div>
            <div className="pa-kpi">
              <div className="label">Quote spread</div>
              <div className="value">
                $0.31<span className="suffix">/kg</span>
              </div>
              <div className="sub">$3.1k on 10,000 kg</div>
            </div>
            <div className="pa-kpi">
              <div className="label">Within target</div>
              <div className="value">
                3<span className="suffix">/4</span>
              </div>
              <div className="sub">1 over target, 0 over walk-away</div>
            </div>
            <div className="pa-kpi">
              <div className="label">Time to terms</div>
              <div className="value">
                38<span className="suffix">min</span>
              </div>
              <div className="sub">vs ~5 days manual</div>
            </div>
          </div>

          {/* filter bar */}
          <div style={{ padding: "20px 28px 14px", display: "flex", alignItems: "center", gap: 10 }}>
            <div className="pa-input-wrap">
              <Icon.Search size={12} />
              <input className="pa-input" placeholder="Search suppliers" />
            </div>
            <FilterDropdown label="Status" value="All" />
            <FilterDropdown label="Certifications" value="Any" />
            <FilterDropdown label="Region" value="India · All" />
            <span style={{ flex: 1 }} />
            <div className="pa-tabs">
              <button className="active">Ranked</button>
              <button>Side-by-side</button>
            </div>
          </div>

          {/* table */}
          <div style={{ flex: 1, overflow: "auto", padding: "0 28px 24px" }}>
            <div className="pa-card-flat" style={{ overflow: "hidden" }}>
              <table className="pa-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>#</th>
                    <th>Supplier</th>
                    <SortableTh active dir="asc">
                      Price /kg
                    </SortableTh>
                    <th>Range</th>
                    <SortableTh>MOQ</SortableTh>
                    <SortableTh>Lead</SortableTh>
                    <th>Payment</th>
                    <th>Certs</th>
                    <th>Sentiment</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s, i) => {
                    const isRec = s.id === recommended.id;
                    const isSel = s.id === selectedId;
                    return (
                      <tr
                        key={s.id}
                        onClick={() => setSelectedId(s.id)}
                        className={`${isRec ? "recommended" : ""} ${isSel ? "selected" : ""}`}
                      >
                        <td className="pa-mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>
                          {i + 1}
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div className="pa-flag" style={{ background: s.color, width: 24, height: 24, fontSize: 11 }}>
                              {s.initial}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                                {s.name}
                                {isRec && (
                                  <span
                                    title="Recommended by agent"
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 3,
                                      fontSize: 10,
                                      padding: "0 5px",
                                      height: 17,
                                      borderRadius: 3,
                                      background: "var(--green-50)",
                                      color: "var(--green-600)",
                                      fontWeight: 500,
                                      letterSpacing: "0.02em",
                                    }}
                                  >
                                    <Icon.Star size={9} /> PICK
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                                {s.city} · {s.language}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div
                            className="pa-num"
                            style={{
                              fontWeight: 500,
                              color: s.priceUsd <= BRIEF.targetUsd ? "var(--green-600)" : "var(--ink)",
                            }}
                          >
                            ${s.priceUsd.toFixed(2)}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--ink-3)" }} className="pa-num">
                            {s.priceUsd <= BRIEF.targetUsd ? "−" : "+"}${Math.abs(s.priceUsd - BRIEF.targetUsd).toFixed(2)} target
                          </div>
                        </td>
                        <td>
                          <MiniPriceBar
                            supplier={s}
                            min={min}
                            max={max}
                            target={BRIEF.targetUsd}
                            walkaway={BRIEF.walkawayUsd}
                            recommended={isRec}
                          />
                        </td>
                        <td className="pa-num">{s.moq / 1000}k</td>
                        <td className="pa-num">{s.leadDays}d</td>
                        <td style={{ color: "var(--ink-2)", fontSize: 12.5 }}>
                          {s.payment
                            .split("/")
                            .map((x) => x.trim().split(" ")[0])
                            .join(" / ")}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                            {s.certs.slice(0, 2).map((c) => (
                              <span key={c} className="pa-chip" style={{ fontSize: 10, height: 17, padding: "0 5px" }}>
                                {c}
                              </span>
                            ))}
                            {s.certs.length > 2 && (
                              <span className="pa-chip" style={{ fontSize: 10, height: 17, padding: "0 5px" }}>
                                +{s.certs.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <SentimentPill value={s.sentiment} />
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="pa-btn pa-btn-ghost"
                            style={{ height: 26, padding: "0 8px", fontSize: 11.5, color: "var(--ink-3)" }}
                          >
                            ⋯
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--ink-4)", display: "flex", alignItems: "center", gap: 6 }}>
              Click a row to view details and reasoning in the inspector.
            </div>
          </div>
        </div>

        {/* inspector */}
        <Inspector supplier={selected} isRecommended={selected.id === recommended.id} />
      </div>
    </div>
  );
}
