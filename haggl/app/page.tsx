"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-[calc(100vh-120px)] flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center text-center py-16">
        <div className="space-y-6 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/5 text-[10px] font-medium text-cyan-400 uppercase tracking-wider">
            AI Procurement Engine · v0.1
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
            <span className="text-slate-100">Negotiate with </span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">every supplier</span>
            <br />
            <span className="text-slate-100">at once</span>
          </h1>
          <p className="text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
            HAGGL dispatches parallel AI voice agents to negotiate pricing, terms, and delivery
            with your entire supplier base — then ranks the results.
          </p>
          <div className="flex items-center justify-center gap-3 pt-4">
            <Link
              href="/rfq/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded-lg transition-all shadow-lg shadow-cyan-500/20"
            >
              Create RFQ
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-slate-700 hover:border-slate-500 text-slate-300 text-sm font-semibold rounded-lg transition-all"
            >
              Dashboard
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-16 w-full max-w-2xl">
          <StatCard value="12k+" label="Calls Processed" />
          <StatCard value="850+" label="Suppliers Engaged" />
          <StatCard value="92%" label="Avg. Savings" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8 w-full max-w-2xl text-left">
          <FeatureCard icon="🎯" title="Parallel Dispatch" desc="Multi-supplier voice calls in parallel with staggered jitter" />
          <FeatureCard icon="🧠" title="Opus Intelligence" desc="Live claim detection + Claude reasoning injection" />
          <FeatureCard icon="📊" title="Scored Rankings" desc="Weighted multi-factor supplier scoring and ranking" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-4 text-center">
      <p className="text-2xl font-bold font-mono text-cyan-400">{value}</p>
      <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">{label}</p>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3.5">
      <span className="text-lg">{icon}</span>
      <p className="text-xs font-semibold text-slate-200 mt-1">{title}</p>
      <p className="text-[10px] text-slate-500 mt-0.5">{desc}</p>
    </div>
  );
}
