"use client";

// Deal Review — empty / skeleton state. Warm chrome + list/inspector
// structure kept; all data renders shimmer placeholders until wired.

import { Icon } from "./icons";
import { Skel, SkelCircle } from "./Skeleton";

function InspectorSkel() {
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
      <div style={{ padding: "20px 22px 16px", borderBottom: "1px solid var(--line-2)" }}>
        <Skel w={70} h={10} style={{ marginBottom: 14 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SkelCircle size={36} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <Skel w={150} h={14} />
            <Skel w={180} h={11} style={{ marginTop: 6 }} />
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "18px 22px" }}>
        <Skel w={50} h={10} style={{ marginBottom: 10 }} />
        <div className="pa-card-inset" style={{ padding: 14, marginBottom: 18 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", gap: 12 }}
            >
              <Skel w={70} h={11} />
              <Skel w={90} h={11} />
            </div>
          ))}
        </div>
        <Skel w={120} h={10} style={{ marginBottom: 10 }} />
        <Skel w="100%" h={64} r={8} />
      </div>
      <div style={{ padding: "14px 22px", borderTop: "1px solid var(--line)", background: "var(--surface)" }}>
        <Skel w="100%" h={36} r={8} style={{ marginBottom: 8 }} />
        <Skel w="100%" h={30} r={8} />
      </div>
    </div>
  );
}

export function DealReview() {
  return (
    <div className="pa-screen pa">
      {/* topbar */}
      <div className="pa-topbar">
        <div className="brand">
          <div className="brand-mark">p</div>
          <span>ProcureAI</span>
        </div>
        <div className="crumbs">
          <Skel w={80} h={11} />
          <span className="sep">/</span>
          <Skel w={120} h={11} />
          <span className="sep">/</span>
          <Skel w={80} h={11} />
        </div>
        <div className="spacer" />
        <Skel w={110} h={24} r={6} />
        <SkelCircle size={26} />
      </div>

      {/* dashboard layout */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {/* page header */}
          <div className="pa-page-head">
            <div style={{ flex: 1 }}>
              <Skel w={140} h={16} />
              <Skel w={320} h={12} style={{ marginTop: 8 }} />
            </div>
            <Skel w={92} h={30} r={8} />
            <Skel w={84} h={30} r={8} />
            <Skel w={120} h={30} r={8} />
          </div>

          {/* KPI strip */}
          <div style={{ padding: "20px 28px 0", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div className="pa-kpi" key={i}>
                <Skel w={90} h={11} />
                <Skel w={72} h={24} style={{ marginTop: 12 }} />
                <Skel w={130} h={11} style={{ marginTop: 10 }} />
              </div>
            ))}
          </div>

          {/* filter bar */}
          <div style={{ padding: "20px 28px 14px", display: "flex", alignItems: "center", gap: 10 }}>
            <Skel w={240} h={30} r={7} />
            <Skel w={90} h={30} r={8} />
            <Skel w={120} h={30} r={8} />
            <Skel w={110} h={30} r={8} />
            <span style={{ flex: 1 }} />
            <Skel w={160} h={30} r={7} />
          </div>

          {/* table */}
          <div style={{ flex: 1, overflow: "auto", padding: "0 28px 24px" }}>
            <div className="pa-card-flat" style={{ overflow: "hidden" }}>
              <table className="pa-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>#</th>
                    <th>Supplier</th>
                    <th>Price /kg</th>
                    <th>Range</th>
                    <th>MOQ</th>
                    <th>Lead</th>
                    <th>Payment</th>
                    <th>Certs</th>
                    <th>Sentiment</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} style={{ cursor: "default" }}>
                      <td><Skel w={14} h={12} /></td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <SkelCircle size={24} />
                          <div>
                            <Skel w={130} h={12} />
                            <Skel w={90} h={10} style={{ marginTop: 6 }} />
                          </div>
                        </div>
                      </td>
                      <td>
                        <Skel w={52} h={12} />
                        <Skel w={68} h={10} style={{ marginTop: 6 }} />
                      </td>
                      <td><Skel w={120} h={12} /></td>
                      <td><Skel w={32} h={12} /></td>
                      <td><Skel w={32} h={12} /></td>
                      <td><Skel w={70} h={12} /></td>
                      <td><Skel w={80} h={12} /></td>
                      <td><Skel w={64} h={19} r={4} /></td>
                      <td style={{ textAlign: "right" }}>
                        <Skel w={24} h={20} r={6} style={{ marginLeft: "auto" }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12 }}>
              <Skel w={300} h={11} />
            </div>
          </div>
        </div>

        {/* inspector */}
        <InspectorSkel />
      </div>
    </div>
  );
}
