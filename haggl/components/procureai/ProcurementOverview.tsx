"use client";

// Procurement Overview — empty / skeleton state. Warm chrome kept; all
// data regions render shimmer placeholders until wired to real data.

import type { ReactNode } from "react";
import { Icon } from "./icons";
import { Skel, SkelCircle } from "./Skeleton";

function TopBar() {
  return (
    <div className="pa-topbar">
      <div className="brand">
        <div className="brand-mark">p</div>
        <span>ProcureAI</span>
      </div>
      <div className="crumbs">
        <Skel w={80} h={11} />
        <span className="sep">/</span>
        <Skel w={120} h={11} />
      </div>
      <div className="spacer" />
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-3)", fontSize: 12.5 }}>
        <Icon.Search size={14} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>⌘K</span>
      </div>
      <SkelCircle size={26} />
    </div>
  );
}

function SideRail() {
  const items: ReactNode[] = [<Icon.Home key="h" />, <Icon.Phone key="p" />, <Icon.Inbox key="i" />, <Icon.Search key="s" />, <Icon.Users key="u" />];
  return (
    <div className="pa-rail">
      {items.map((icon, i) => (
        <div key={i} className={`item ${i === 0 ? "active" : ""}`}>
          {icon}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div className="item">
        <Icon.Cog />
      </div>
    </div>
  );
}

export function ProcurementOverview() {
  return (
    <div className="pa-screen pa">
      <TopBar />
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <SideRail />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* page header */}
          <div className="pa-page-head">
            <div style={{ flex: 1 }}>
              <Skel w={200} h={16} />
              <Skel w={300} h={12} style={{ marginTop: 8 }} />
            </div>
            <Skel w={86} h={30} r={8} />
            <Skel w={64} h={30} r={8} />
            <Skel w={86} h={30} r={8} />
          </div>

          {/* KPI strip */}
          <div style={{ padding: "20px 28px 0", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div className="pa-kpi" key={i}>
                <Skel w={96} h={11} />
                <Skel w={68} h={24} style={{ marginTop: 12 }} />
                <Skel w={120} h={11} style={{ marginTop: 10 }} />
              </div>
            ))}
          </div>

          {/* call list */}
          <div style={{ padding: "24px 28px", flex: 1, overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Skel w={130} h={14} />
              <div style={{ display: "flex", gap: 8 }}>
                <Skel w={180} h={30} r={7} />
                <Skel w={150} h={30} r={8} />
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
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} style={{ cursor: "default" }}>
                      <td style={{ width: 24, paddingRight: 0 }}>
                        <SkelCircle size={24} />
                      </td>
                      <td><Skel w={140} h={12} /></td>
                      <td><Skel w={120} h={12} /></td>
                      <td><Skel w={64} h={12} /></td>
                      <td><Skel w={72} h={12} /></td>
                      <td><Skel w={90} h={12} /></td>
                      <td><Skel w={56} h={12} /></td>
                      <td style={{ textAlign: "right" }}>
                        <Skel w={64} h={20} r={6} style={{ marginLeft: "auto" }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 16 }}>
              <Skel w={280} h={11} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
