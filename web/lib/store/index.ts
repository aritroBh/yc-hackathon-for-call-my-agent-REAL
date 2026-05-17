import { create } from "zustand";
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
} from "@/lib/types";
import {
  seedRfq,
  seedSuppliers,
  seedCalls,
  seedCallOrder,
  seedChat,
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

  /** The single live-data entry point. Mock simulator AND a real
   *  Vapi/WebSocket bridge both call this — nothing else mutates calls. */
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

  reset: () => void;
}

const COST_PER_CALL_MINUTE = 0.18;

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

export const useAtlas = create<AtlasState>((set, get) => ({
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
        set({
          calls: patchCall(state, e.call_id, {
            status: "completed",
            phase: "completed",
            result,
            ended_at: e.timestamp,
          }),
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
              "On it — I'm dialing all 6 suppliers now and negotiating live. Watch the deals come in.",
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

  reset: () =>
    set({
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
    }),
}));
