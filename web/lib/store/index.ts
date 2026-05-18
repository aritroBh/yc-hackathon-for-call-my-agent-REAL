import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  RFQ,
  Supplier,
  NegotiationCall,
  TranscriptEntry,
  NegotiationResult,
  LiveCallEvent,
  ChatMessage,
  CallStatus,
  NegotiationPhase,
  OnboardingAnswers,
  SourcingPlan,
  ResearchedSupplier,
  ResearchRun,
} from "@/lib/types";
import {
  seedRfq,
  seedSuppliers,
  seedCalls,
  seedCallOrder,
  seedChat,
  buildSeedRuns,
  blankSeedCampaign,
  DEMO_RUN_ID,
} from "@/lib/data/seed";

interface ChatSlice {
  expanded: boolean;
  messages: ChatMessage[];
  unread: number;
  agentTyping: boolean;
}

export interface AtlasState {
  rfq: RFQ | null;
  suppliers: Record<string, Supplier>;
  calls: Record<string, NegotiationCall>;
  callOrder: string[];

  campaignStartedAt: string | null;
  elapsedSeconds: number;
  totalCostUsd: number;
  isPausedAll: boolean;
  magicMomentActive: boolean;
  callingStarted: boolean;

  chat: ChatSlice;

  /** Onboarding answers, captured at "Start sourcing" and read by
   *  `/planning` to draft the plan. Survives client-side navigation. */
  onboardingAnswers: OnboardingAnswers | null;
  /** The drafted/refined sourcing plan reviewed on `/plan`. */
  plan: SourcingPlan | null;
  /** Phase-2 Gemini Deep Research lifecycle. Set to "running" on plan
   *  commit; the (app)-level ResearchRunner drives it to "done"/"error".
   *  The dashboard "Ready" state renders off this. */
  researchStatus: "idle" | "running" | "done" | "error";
  /** Live status line from the deep-research SSE (haggl `status` events),
   *  e.g. "Parsing supplier prospects…". Shown on the dashboard. */
  researchMessage: string | null;
  /** Full per-company dossiers from research — the per-call context the
   *  dashboard surfaces and (next step) the voice agent will use. */
  researchedCompanies: ResearchedSupplier[];

  /** Registry of all runs (research → calls). The fields above are the
   *  LIVE working copy of `activeRunId`; everything else lives here as a
   *  snapshot. Selectors keep reading the live fields unchanged. */
  runs: Record<string, ResearchRun>;
  runOrder: string[];
  activeRunId: string | null;

  /** The single live-data entry point. Mock simulator AND a real
   *  Vapi/WebSocket bridge both call this - nothing else mutates calls. */
  ingestEvent: (e: LiveCallEvent) => void;
  tick: (deltaSeconds: number) => void;

  togglePauseAll: () => void;
  startCalling: () => void;
  triggerMagicMoment: () => void;
  clearMagicMoment: () => void;
  beginCampaign: () => void;

  setChatExpanded: (expanded: boolean) => void;
  pushChatMessage: (m: ChatMessage) => void;
  setAgentTyping: (typing: boolean) => void;

  setOnboardingAnswers: (a: OnboardingAnswers) => void;
  setPlan: (p: SourcingPlan | null) => void;
  setResearchStatus: (s: AtlasState["researchStatus"]) => void;
  setResearchMessage: (m: string | null) => void;
  setResearchedCompanies: (c: ResearchedSupplier[]) => void;

  /** Write the live working fields back into `runs[activeRunId]`. Called
   *  before switching runs and on run-page unmount. */
  snapshotActiveRun: () => void;
  /** Snapshot the current run, then mirror `runs[id]` into the live
   *  fields and make it active. */
  loadRun: (id: string) => void;
  /** Create a new run from a plan (research starting), make it active,
   *  return its id. */
  createRun: (plan: SourcingPlan | null, title?: string) => string;
  /** Update a run's research slice by id (mirrors to live if active).
   *  Safe for a backgrounded run the user has navigated away from. */
  patchRunResearch: (
    runId: string,
    patch: Partial<ResearchRun["research"]>,
  ) => void;
  /** Set a run's plan by id (mirrors to live if active). */
  setRunPlan: (runId: string, plan: SourcingPlan | null) => void;

  reset: () => void;
}

const COST_PER_CALL_MINUTE = 0.18;

const SEED_RUNS = buildSeedRuns();

/** Fields that are mirrored between the live store and a run snapshot. */
function liveFieldsFrom(r: ResearchRun) {
  return {
    rfq: r.rfq,
    suppliers: r.suppliers,
    calls: r.calls,
    callOrder: r.callOrder,
    callingStarted: r.callingStarted,
    campaignStartedAt: r.campaignStartedAt,
    elapsedSeconds: r.elapsedSeconds,
    totalCostUsd: r.totalCostUsd,
    isPausedAll: r.isPausedAll,
    magicMomentActive: false,
    plan: r.plan,
    researchStatus: r.research.status,
    researchMessage: r.research.message,
    researchedCompanies: r.research.companies,
  };
}

function patchCall(
  state: AtlasState,
  callId: string,
  patch: Partial<NegotiationCall>,
): Record<string, NegotiationCall> {
  const existing = state.calls[callId];
  if (!existing) return state.calls;
  return {
    ...state.calls,
    [callId]: { ...existing, ...patch, updated_at: new Date().toISOString() },
  };
}

export const useAtlas = create<AtlasState>()(
  persist(
    (set, get) => ({
  rfq: seedRfq,
  suppliers: seedSuppliers,
  calls: seedCalls,
  callOrder: seedCallOrder,

  campaignStartedAt: null,
  elapsedSeconds: 0,
  totalCostUsd: 0,
  isPausedAll: false,
  magicMomentActive: false,
  callingStarted: false,

  chat: { expanded: false, messages: seedChat, unread: 0, agentTyping: false },

  onboardingAnswers: null,
  plan: null,
  researchStatus: "idle",
  researchMessage: null,
  researchedCompanies: [],

  runs: SEED_RUNS.runs,
  runOrder: SEED_RUNS.runOrder,
  activeRunId: DEMO_RUN_ID,

  ingestEvent: (e: LiveCallEvent) => {
    const state = get();
    const call = state.calls[e.call_id];
    if (!call) return;
    const d = e.data as Record<string, unknown>;

    switch (e.type) {
      case "call_initiated":
        set({ calls: patchCall(state, e.call_id, { status: "queued" }) });
        break;

      case "call_ringing":
        set({ calls: patchCall(state, e.call_id, { status: "ringing" }) });
        break;

      case "call_connected":
        set({
          calls: patchCall(state, e.call_id, {
            status: "in-progress",
            phase: "greeting",
            started_at: e.timestamp,
          }),
        });
        break;

      case "negotiation_phase_change":
        set({
          calls: patchCall(state, e.call_id, {
            phase: d.phase as NegotiationPhase,
          }),
        });
        break;

      case "transcript_delta": {
        const entry: TranscriptEntry = {
          role: (d.role as TranscriptEntry["role"]) ?? "supplier",
          content: String(d.content ?? ""),
          timestamp: e.timestamp,
          metadata: d.translation_en
            ? { translation_en: d.translation_en, language: d.language }
            : undefined,
        };
        set({
          calls: patchCall(state, e.call_id, {
            transcript: [...call.transcript, entry],
          }),
        });
        break;
      }

      case "negotiation_result": {
        const result = d.result as NegotiationResult;
        const calls = patchCall(state, e.call_id, {
          status: "completed",
          phase: "completed",
          result,
          ended_at: e.timestamp,
        });

        // Tie the chat to the calls: announce a new best offer, and a
        // wrap-up once every call has reached a terminal state.
        const TERMINAL = [
          "completed",
          "capped",
          "failed",
          "no-answer",
          "busy",
          "rejected",
          "timeout",
        ];
        let prevBest = Number.POSITIVE_INFINITY;
        for (const c of Object.values(state.calls)) {
          const p = c.result?.quoted_price;
          if (c.id !== e.call_id && c.status === "completed" && p != null)
            prevBest = Math.min(prevBest, p);
        }
        const price = result.quoted_price;
        const added: ChatMessage[] = [];
        if (price != null && price < prevBest) {
          added.push({
            id: `a_best_${e.call_id}`,
            role: "agent",
            content: `New best - ${result.supplier_name} agreed to $${price.toFixed(2)}/unit${
              result.delivery_timeline ? `, ${result.delivery_timeline}` : ""
            }.`,
            timestamp: e.timestamp,
          });
        }
        const allCalls = Object.values(calls);
        const allDone =
          allCalls.length > 0 &&
          allCalls.every((c) => TERMINAL.includes(c.status));
        if (allDone) {
          let bp = Number.POSITIVE_INFINITY;
          let bn = "";
          for (const c of allCalls) {
            const p = c.result?.quoted_price;
            if (c.status === "completed" && p != null && p < bp) {
              bp = p;
              bn = c.result?.supplier_name ?? "";
            }
          }
          added.push({
            id: `a_wrap_${Date.now()}`,
            role: "agent",
            content:
              bn === ""
                ? "All calls are done - no supplier met your cap. Want me to widen the search?"
                : `All 6 calls done. Best deal: $${bp.toFixed(2)}/unit with ${bn}. Want me to lock it in?`,
            timestamp: e.timestamp,
          });
        }

        set({
          calls,
          chat:
            added.length === 0
              ? state.chat
              : {
                  ...state.chat,
                  messages: [...state.chat.messages, ...added],
                  unread: state.chat.expanded
                    ? state.chat.unread
                    : state.chat.unread + added.length,
                },
        });
        break;
      }

      case "call_capped":
        set({
          calls: patchCall(state, e.call_id, {
            status: "capped",
            phase: "failed",
            ended_at: e.timestamp,
            error_message: String(d.reason ?? "Could not meet price cap"),
          }),
        });
        break;

      case "call_failed":
      case "call_disconnected":
        set({
          calls: patchCall(state, e.call_id, {
            status: (d.status as CallStatus) ?? "failed",
            ended_at: e.timestamp,
          }),
        });
        break;

      default:
        break;
    }
  },

  tick: (deltaSeconds: number) => {
    const s = get();
    if (s.isPausedAll || !s.callingStarted) return;
    const activeCount = Object.values(s.calls).filter(
      (c) => c.status === "in-progress" || c.status === "ringing",
    ).length;
    set({
      elapsedSeconds: s.elapsedSeconds + deltaSeconds,
      totalCostUsd:
        s.totalCostUsd +
        (activeCount * COST_PER_CALL_MINUTE * deltaSeconds) / 60,
    });
  },

  togglePauseAll: () => set((s) => ({ isPausedAll: !s.isPausedAll })),

  startCalling: () =>
    set((s) =>
      s.callingStarted
        ? {}
        : {
            callingStarted: true,
            campaignStartedAt: new Date().toISOString(),
          },
    ),

  triggerMagicMoment: () =>
    set((s) => ({
      magicMomentActive: true,
      callingStarted: true,
      campaignStartedAt: s.campaignStartedAt ?? new Date().toISOString(),
    })),

  clearMagicMoment: () => set({ magicMomentActive: false }),

  beginCampaign: () => {
    const s = get();
    if (s.callingStarted) return;
    set({
      callingStarted: true,
      magicMomentActive: true,
      campaignStartedAt: new Date().toISOString(),
      chat: {
        ...s.chat,
        expanded: false,
        messages: [
          ...s.chat.messages,
          {
            id: `a_start_${Date.now()}`,
            role: "agent",
            content:
              "On it - I'm dialing all 6 suppliers now and negotiating live. Watch the deals come in.",
            timestamp: new Date().toISOString(),
          },
        ],
      },
    });
  },

  setChatExpanded: (expanded) =>
    set((s) => ({
      chat: { ...s.chat, expanded, unread: expanded ? 0 : s.chat.unread },
    })),

  pushChatMessage: (m) =>
    set((s) => ({
      chat: {
        ...s.chat,
        messages: [...s.chat.messages, m],
        unread:
          m.role === "agent" && !s.chat.expanded
            ? s.chat.unread + 1
            : s.chat.unread,
      },
    })),

  setAgentTyping: (agentTyping) =>
    set((s) => ({ chat: { ...s.chat, agentTyping } })),

  setOnboardingAnswers: (onboardingAnswers) => set({ onboardingAnswers }),
  setPlan: (plan) => set({ plan }),
  setResearchStatus: (researchStatus) => set({ researchStatus }),
  setResearchMessage: (researchMessage) => set({ researchMessage }),
  setResearchedCompanies: (researchedCompanies) => set({ researchedCompanies }),

  snapshotActiveRun: () => {
    const s = get();
    const id = s.activeRunId;
    const prev = id ? s.runs[id] : undefined;
    if (!id || !prev) return;
    set({
      runs: {
        ...s.runs,
        [id]: {
          ...prev,
          rfq: s.rfq,
          suppliers: s.suppliers,
          calls: s.calls,
          callOrder: s.callOrder,
          callingStarted: s.callingStarted,
          campaignStartedAt: s.campaignStartedAt,
          elapsedSeconds: s.elapsedSeconds,
          totalCostUsd: s.totalCostUsd,
          isPausedAll: s.isPausedAll,
          plan: s.plan,
          research: {
            status: s.researchStatus,
            message: s.researchMessage,
            companies: s.researchedCompanies,
          },
        },
      },
    });
  },

  loadRun: (id) => {
    const s = get();
    const r = s.runs[id];
    if (!r) return;
    if (id === s.activeRunId) return;
    get().snapshotActiveRun();
    set({ activeRunId: id, ...liveFieldsFrom(get().runs[id] ?? r) });
  },

  createRun: (plan, title) => {
    get().snapshotActiveRun();
    const id = `run_${Date.now().toString(36)}`;
    const label =
      title ||
      (plan
        ? plan.productLabel.charAt(0).toUpperCase() + plan.productLabel.slice(1)
        : "New sourcing run");
    const run: ResearchRun = {
      id,
      title: label,
      createdAt: new Date().toISOString(),
      plan: plan ?? null,
      research: { status: "running", message: null, companies: [] },
      ...blankSeedCampaign(),
      callingStarted: false,
      campaignStartedAt: null,
      elapsedSeconds: 0,
      totalCostUsd: 0,
      isPausedAll: false,
    };
    set((st) => ({
      runs: { ...st.runs, [id]: run },
      runOrder: [id, ...st.runOrder],
      activeRunId: id,
      ...liveFieldsFrom(run),
    }));
    return id;
  },

  patchRunResearch: (runId, patch) =>
    set((s) => {
      const r = s.runs[runId];
      if (!r) return {};
      const research = { ...r.research, ...patch };
      const mirror =
        s.activeRunId === runId
          ? {
              researchStatus: research.status,
              researchMessage: research.message,
              researchedCompanies: research.companies,
            }
          : {};
      return {
        runs: { ...s.runs, [runId]: { ...r, research } },
        ...mirror,
      };
    }),

  setRunPlan: (runId, plan) =>
    set((s) => {
      const r = s.runs[runId];
      if (!r) return {};
      return {
        runs: { ...s.runs, [runId]: { ...r, plan } },
        ...(s.activeRunId === runId ? { plan } : {}),
      };
    }),

  reset: () => {
    const seeded = buildSeedRuns();
    set({
      ...liveFieldsFrom(seeded.runs[DEMO_RUN_ID]),
      callingStarted: false,
      chat: { expanded: false, messages: seedChat, unread: 0, agentTyping: false },
      onboardingAnswers: null,
      runs: seeded.runs,
      runOrder: seeded.runOrder,
      activeRunId: DEMO_RUN_ID,
    });
  },
    }),
    {
      // Persist research to BROWSER STORAGE for now (no backend DB):
      // research dossiers live inside `runs` (patchRunResearch writes
      // there), so persisting the run registry survives reloads. Live
      // mirror / chat / simulator state is intentionally NOT persisted —
      // it's re-derived from the active run on rehydrate.
      name: "haggl-store",
      version: 1,
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? window.localStorage
          : (undefined as unknown as Storage),
      ),
      partialize: (s) => ({
        runs: s.runs,
        runOrder: s.runOrder,
        activeRunId: s.activeRunId,
        onboardingAnswers: s.onboardingAnswers,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AtlasState>;
        const seeded = buildSeedRuns();
        // Seed runs (demo + history) are ALWAYS present; persisted user
        // runs win on id collision and keep their saved research.
        const runs = { ...seeded.runs, ...(p.runs ?? {}) };
        const order: string[] = [];
        for (const id of p.runOrder ?? [])
          if (runs[id] && !order.includes(id)) order.push(id);
        for (const id of seeded.runOrder)
          if (!order.includes(id)) order.push(id);
        const activeRunId =
          p.activeRunId && runs[p.activeRunId] ? p.activeRunId : DEMO_RUN_ID;
        return {
          ...current,
          runs,
          runOrder: order,
          activeRunId,
          onboardingAnswers: p.onboardingAnswers ?? current.onboardingAnswers,
          ...liveFieldsFrom(runs[activeRunId]),
        };
      },
    },
  ),
);
