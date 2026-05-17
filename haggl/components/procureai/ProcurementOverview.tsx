"use client";

// Procurement Overview (dashboard). Driven entirely by real RFQ data from
// /api/rfqs — no static mock suppliers or hardcoded briefs.

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { Popover } from "./Popover";

interface RFQ {
  id: string;
  title: string;
  status: string;
  target_price: number | null;
  currency: string;
  deadline: string | null;
  created_at: string;
}

interface FeedItem {
  time: string;
  text: string;
}

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

function BriefPopover({ rfq }: { rfq: RFQ | null }) {
  return (
    <div style={{ padding: 18 }}>
      <div className="pa-eyebrow" style={{ marginBottom: 10 }}>
        Procurement brief
      </div>
      <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6 }}>
        <Row k="RFQ" v={rfq?.title || "—"} />
        <Row k="Status" v={rfq?.status || "—"} />
        <Row
          k="Target price"
          v={rfq?.target_price != null ? `${rfq.currency || "USD"} ${rfq.target_price}` : "—"}
          highlight
        />
        <Row k="Deadline" v={rfq?.deadline || "—"} />
        <Row k="Created" v={rfq ? new Date(rfq.created_at).toLocaleString() : "—"} />
      </div>
    </div>
  );
}

function ActivityPopover({ feed }: { feed: FeedItem[] }) {
  return (
    <div style={{ padding: "14px 4px 8px" }}>
      <div style={{ padding: "0 14px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="pa-eyebrow">Agent activity</span>
        <span className="pa-mono" style={{ fontSize: 10, color: "var(--ink-4)" }}>
          live
        </span>
      </div>
      <div style={{ maxHeight: 320, overflow: "auto" }}>
        {feed.length === 0 ? (
          <div style={{ padding: "16px 14px", fontSize: 12.5, color: "var(--ink-4)" }}>
            No activity yet.
          </div>
        ) : (
          feed.map((it, i) => (
            <div
              key={i}
              style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: 8, padding: "9px 14px", alignItems: "flex-start" }}
            >
              <div className="pa-mono" style={{ fontSize: 10.5, color: "var(--ink-4)", paddingTop: 3 }}>
                {it.time}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{it.text}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function ProcurementOverview() {
  const router = useRouter();
  const [demoLoading, setDemoLoading] = useState(false);
  const [rlLoading, setRlLoading] = useState(false);
  const [rlResult, setRlResult] = useState<string | null>(null);
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [feed] = useState<FeedItem[]>([]);

  useEffect(() => {
    const orgId = process.env.NEXT_PUBLIC_DEMO_ORG_ID;
    if (!orgId) return;
    fetch(`/api/rfqs?organization_id=${encodeURIComponent(orgId)}`)
      .then((r) => r.json())
      .then((d) => setRfqs(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

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

  const activeRfq = rfqs[0] || null;
  const negotiatingCount = rfqs.filter((r) => r.status === "negotiating").length;
  const openMonitor = () => {
    if (activeRfq) router.push(`/rfq/${activeRfq.id}/monitor`);
    else router.push("/rfq/new");
  };

  return (
    <div className="pa-screen pa">
      <TopBar crumbs={["Procurements", activeRfq?.title || "No RFQ selected"]} />
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <SideRail active="home" />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* dashboard page header */}
          <div className="pa-page-head">
            <div style={{ flex: 1 }}>
              <div className="pa-page-title">
                <span>{activeRfq?.title || "No active RFQ"}</span>
                {activeRfq && (
                  <span className="pa-chip clay" style={{ height: 20, fontSize: 10.5 }}>
                    {activeRfq.status}
                  </span>
                )}
              </div>
              <div className="pa-page-sub" style={{ marginTop: 4 }}>
                {activeRfq
                  ? `Deadline ${activeRfq.deadline || "—"}`
                  : "Create an RFQ to start negotiating"}
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
                </button>
              }
            >
              <ActivityPopover feed={feed} />
            </Popover>

            <Popover
              width={320}
              trigger={
                <button className="pa-btn pa-btn-ghost" style={{ height: 30, color: "var(--ink-2)" }}>
                  Brief
                </button>
              }
            >
              <BriefPopover rfq={activeRfq} />
            </Popover>

            <button
              className="pa-btn pa-btn-ghost"
              style={{ height: 30, color: "var(--ink-2)" }}
              onClick={() => router.push("/rfq/new")}
            >
              <Icon.Plus size={13} /> New RFQ
            </button>
          </div>

          {/* KPI strip */}
          <div style={{ padding: "20px 28px 0", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <div className="pa-kpi">
              <div className="label">RFQs</div>
              <div className="value">{rfqs.length}</div>
              <div className="sub">{negotiatingCount} negotiating</div>
            </div>
            <div className="pa-kpi">
              <div className="label">Target price</div>
              <div className="value">
                {activeRfq?.target_price != null ? `${activeRfq.currency || "USD"} ${activeRfq.target_price}` : "—"}
              </div>
              <div className="sub">{activeRfq?.title || "—"}</div>
            </div>
            <div className="pa-kpi">
              <div className="label">Deadline</div>
              <div className="value" style={{ fontSize: 16 }}>{activeRfq?.deadline || "—"}</div>
              <div className="sub">{activeRfq ? activeRfq.status : "—"}</div>
            </div>
            <div className="pa-kpi">
              <div className="label">Status</div>
              <div className="value" style={{ fontSize: 16 }}>{activeRfq?.status || "—"}</div>
              <div className="sub">{activeRfq ? new Date(activeRfq.created_at).toLocaleDateString() : "—"}</div>
            </div>
          </div>

          {/* RFQ list */}
          <div style={{ padding: "24px 28px", flex: 1, overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>RFQs · {rfqs.length}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="pa-btn" onClick={openMonitor}>
                  Open call monitor <Icon.ArrowRight size={11} />
                </button>
              </div>
            </div>

            <div className="pa-card" style={{ overflow: "hidden" }}>
              <table className="pa-table">
                <thead>
                  <tr>
                    <th>RFQ</th>
                    <th>Status</th>
                    <th>Target price</th>
                    <th>Deadline</th>
                    <th>Created</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rfqs.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", color: "var(--ink-4)", padding: "32px 0", fontSize: 13 }}>
                        No RFQs yet —{" "}
                        <button
                          onClick={() => router.push("/rfq/new")}
                          style={{ color: "var(--clay-600)", textDecoration: "underline" }}
                        >
                          create one with Deep Research
                        </button>
                      </td>
                    </tr>
                  ) : (
                    rfqs.map((rfq) => (
                      <tr key={rfq.id}>
                        <td style={{ fontWeight: 500 }}>{rfq.title}</td>
                        <td style={{ color: "var(--ink-3)" }}>{rfq.status}</td>
                        <td className="pa-num">
                          {rfq.target_price != null ? `${rfq.currency || "USD"} ${rfq.target_price}` : "—"}
                        </td>
                        <td style={{ color: "var(--ink-3)" }}>{rfq.deadline || "—"}</td>
                        <td style={{ color: "var(--ink-3)" }}>{new Date(rfq.created_at).toLocaleDateString()}</td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            onClick={() => router.push(`/rfq/${rfq.id}/monitor`)}
                            className="pa-btn pa-btn-ghost"
                            style={{ height: 26, padding: "0 8px", fontSize: 11.5, color: "var(--ink-3)" }}
                          >
                            Monitor <Icon.ArrowRight size={11} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
