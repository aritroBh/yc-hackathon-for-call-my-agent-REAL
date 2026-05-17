import type { LiveCallEvent, NegotiationResult } from "@/lib/types";
import { SUPPLIER_OUTCOMES, RFQ_ID_EXPORT } from "./seed";

interface Beat {
  offsetMs: number;
  build: (ts: string) => Omit<LiveCallEvent, "timestamp"> & { timestamp?: string };
}

/** Scripted bilingual lines — native line + English translation. */
const LINES: Record<
  "Yoruba" | "Twi",
  { agentGreet: [string, string]; supGreet: [string, string]; agentAsk: [string, string]; supQuote: [string, string]; agentCounter: [string, string]; supClose: [string, string] }
> = {
  Yoruba: {
    agentGreet: ["Ẹ ku iṣẹ́. Mo ń pè nípa àwọn bàtà awọ.", "Good day. I'm calling about the leather sandals."],
    supGreet: ["A dúpẹ́. Ẹ jọ̀wọ́ sọ iye tí ẹ fẹ́.", "Welcome. Please tell me the quantity you need."],
    agentAsk: ["Ẹ̀ẹ́dẹ́gbẹ̀ta sí ọ̀tà, ìwọ̀n 40 sí 45.", "Five hundred pairs, sizes 40 to 45."],
    supQuote: ["Owó rẹ̀ jẹ́ dọ́là márùn-ún ó lé.", "The price is just over five dollars a pair."],
    agentCounter: ["A lè san dọ́là mẹ́rin ààbọ̀ tí ẹ bá fi kún ọ.", "We can do four-fifty if you add volume."],
    supClose: ["Ó dára. À ṣe é fún ọ.", "Alright. We can make it work for you."],
  },
  Twi: {
    agentGreet: ["Maakye. Merefrɛ wo wɔ leather mpaboa ho.", "Good morning. I'm calling about the leather sandals."],
    supGreet: ["Akwaaba. Kyerɛ me dodow a wopɛ.", "Welcome. Tell me the quantity you want."],
    agentAsk: ["Mpaboa ahanum, size 40 kɔsi 45.", "Five hundred pairs, sizes 40 to 45."],
    supQuote: ["Ne boɔ yɛ dollar num ne fa.", "The price is five and a half dollars a pair."],
    agentCounter: ["Yɛbɛtumi atua dollar ɛnan ne fa.", "We can pay four-fifty a pair."],
    supClose: ["Ɛyɛ. Yɛbɛyɛ ama wo.", "That's fine. We'll do it for you."],
  },
};

function ev(
  type: LiveCallEvent["type"],
  callId: string,
  supplierId: string,
  data: Record<string, unknown> = {},
): Omit<LiveCallEvent, "timestamp"> {
  return { type, call_id: callId, rfq_id: RFQ_ID_EXPORT, supplier_id: supplierId, data };
}

/** Build the full timed beat list for one call. */
export function scriptForCall(
  callId: string,
  supplierId: string,
  language: "Yoruba" | "Twi",
  supplierName: string,
  units: number,
): Beat[] {
  const L = LINES[language];
  const outcome = SUPPLIER_OUTCOMES[supplierId] ?? {
    price: 4.8,
    lead: 21,
    outcome: "reached" as const,
  };

  const tx = (
    offsetMs: number,
    role: "agent" | "supplier",
    pair: [string, string],
  ): Beat => ({
    offsetMs,
    build: () =>
      ev("transcript_delta", callId, supplierId, {
        role,
        content: pair[0],
        translation_en: pair[1],
        language,
      }),
  });

  const beats: Beat[] = [
    { offsetMs: 0, build: () => ev("call_initiated", callId, supplierId) },
    { offsetMs: 900, build: () => ev("call_ringing", callId, supplierId) },
    { offsetMs: 2600, build: () => ev("call_connected", callId, supplierId) },
    tx(3800, "agent", L.agentGreet),
    tx(5600, "supplier", L.supGreet),
    {
      offsetMs: 6600,
      build: () =>
        ev("negotiation_phase_change", callId, supplierId, { phase: "negotiation" }),
    },
    tx(7400, "agent", L.agentAsk),
    tx(9300, "supplier", L.supQuote),
    tx(11200, "agent", L.agentCounter),
    tx(13000, "supplier", L.supClose),
    {
      offsetMs: 14200,
      build: () =>
        ev("negotiation_phase_change", callId, supplierId, { phase: "closing" }),
    },
  ];

  if (outcome.outcome === "capped") {
    beats.push({
      offsetMs: 15400,
      build: () =>
        ev("call_capped", callId, supplierId, {
          reason: "Wouldn't go below $6.10 — over the $5.00 cap",
        }),
    });
  } else {
    const result: NegotiationResult = {
      supplier_id: supplierId,
      supplier_name: supplierName,
      quoted_price: outcome.outcome === "declined" ? null : outcome.price,
      quoted_terms:
        outcome.outcome === "declined"
          ? "Held firm at $5.80/pair — above cap"
          : `${units} pairs at $${outcome.price?.toFixed(2)}/pair, 40% deposit`,
      delivery_timeline: outcome.lead ? `${outcome.lead} days` : null,
      confidence_score: outcome.outcome === "reached" ? 0.92 : 0.41,
      raw_transcript_snippet: L.supClose[1],
      structured_offer:
        outcome.outcome === "declined"
          ? null
          : { unit_price: outcome.price, moq: units, deposit_pct: 40 },
    };
    beats.push({
      offsetMs: 15400,
      build: () =>
        ev("negotiation_result", callId, supplierId, { result }),
    });
  }

  return beats;
}
