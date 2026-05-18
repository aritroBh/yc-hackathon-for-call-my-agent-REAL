import type { LiveCallEvent, NegotiationResult } from "@/lib/types";
import { SUPPLIER_OUTCOMES, RFQ_ID_EXPORT } from "./seed";

interface Beat {
  offsetMs: number;
  build: (ts: string) => Omit<LiveCallEvent, "timestamp"> & { timestamp?: string };
}

type Language = "Yoruba" | "Hindi" | "Bengali";

/** Scripted bilingual lines — native line + English translation. */
const LINES: Record<
  Language,
  { agentGreet: [string, string]; supGreet: [string, string]; agentAsk: [string, string]; supQuote: [string, string]; agentCounter: [string, string]; supClose: [string, string] }
> = {
  Yoruba: {
    agentGreet:  ["Ẹ ku iṣẹ́. Mo ń pè nípa àwọn bàtà awọ.", "Good day. I'm calling about the leather sandals."],
    supGreet:    ["A dúpẹ́. Ẹ jọ̀wọ́ sọ iye tí ẹ fẹ́.", "Welcome. Please tell me the quantity you need."],
    agentAsk:    ["Ẹ̀ẹ́dẹ́gbẹ̀ta sí ọ̀tà, ìwọ̀n 40 sí 45.", "Five hundred pairs, sizes 40 to 45."],
    supQuote:    ["Owó rẹ̀ jẹ́ dọ́là márùn-ún ó lé.", "The price is just over five dollars a pair."],
    agentCounter:["A lè san dọ́là mẹ́rin ààbọ̀ tí ẹ bá fi kún ọ.", "We can do four-fifty if you add volume."],
    supClose:    ["Ó dára. À ṣe é fún ọ.", "Alright. We can make it work for you."],
  },
  Hindi: {
    agentGreet:  ["Namaste ji, main HAGGL ki taraf se baat kar raha hoon, leather sandals ke baare mein.", "Hello sir, I'm calling from HAGGL about the leather sandals."],
    supGreet:    ["Haan ji, batayiye — kitne pairs chahiye aapko?", "Yes sir, tell me — how many pairs do you need?"],
    agentAsk:    ["Paanch sau pairs chahiye, size 40 se 45 tak, full-grain leather.", "Five hundred pairs, sizes 40 to 45, full-grain leather."],
    supQuote:    ["Ji, hamare liye yeh paanch dollar bees cents padega per pair.", "Sir, this will cost us five dollars twenty cents per pair."],
    agentCounter:["Kya char dollar sotra possible hai agar hum volume badhaayen?", "Can you do four-fifty if we increase the volume?"],
    supClose:    ["Theek hai ji, dekh lete hain — kuch room hai.", "Alright sir, let's see — there's some room."],
  },
  Bengali: {
    agentGreet:  ["Namaskar, ami HAGGL theke phone korchi leather sandal er byapare.", "Good day, I'm calling from HAGGL about the leather sandals."],
    supGreet:    ["Haan, bolun — koto piece lagbe aapnar?", "Yes, please tell me — how many pieces do you need?"],
    agentAsk:    ["Panchso pair lagbe, size chollish theke panchollish, full-grain leather.", "We need five hundred pairs, sizes 40 to 45, full-grain leather."],
    supQuote:    ["Daam pore pach dollar bish cents per pair.", "The price comes to five dollars twenty cents per pair."],
    agentCounter:["Char dollar panchash e dite parben ki jodi volume bariye dii?", "Can you do four-fifty if we increase volume?"],
    supClose:    ["Thik ache, ami try korbo aapnar jonno.", "Alright, I'll try to make it work for you."],
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
  language: Language,
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
    { offsetMs: 0,     build: () => ev("call_initiated",          callId, supplierId) },
    { offsetMs: 900,   build: () => ev("call_ringing",            callId, supplierId) },
    { offsetMs: 2600,  build: () => ev("call_connected",          callId, supplierId) },
    tx(3800,  "agent",    L.agentGreet),
    tx(5600,  "supplier", L.supGreet),
    { offsetMs: 6600, build: () => ev("negotiation_phase_change", callId, supplierId, { phase: "negotiation" }) },
    tx(7400,  "agent",    L.agentAsk),
    tx(9300,  "supplier", L.supQuote),
    tx(11200, "agent",    L.agentCounter),
    tx(13000, "supplier", L.supClose),
    { offsetMs: 14200, build: () => ev("negotiation_phase_change", callId, supplierId, { phase: "closing" }) },
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
      build: () => ev("negotiation_result", callId, supplierId, { result }),
    });
  }

  return beats;
}
