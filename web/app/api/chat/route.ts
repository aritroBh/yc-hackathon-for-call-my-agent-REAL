import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface InMsg {
  role: "agent" | "user" | "system";
  content: string;
}

const SYSTEM = `You are the voice negotiation agent for "haggl". A buyer is sourcing
products from overseas suppliers who often don't speak English. Your job in this
chat is to quickly gather enough context to start calling suppliers on their behalf.

Rules:
- Be warm, concise and confident. 1–3 sentences per reply. No bullet lists, no markdown.
- Ask at most ONE clarifying question per message. Prioritise: what product, target
  budget / hard price cap, order quantity, preferred regions, delivery timeline.
- Don't re-ask anything the user already answered.
- Currencies in USD. Regions you can reach: West Africa (Yoruba, Twi) and India (Hindi).
- Once you know (a) the product, (b) a budget or hard cap, and (c) at least one region
  OR an explicit "anywhere", confirm the plan in one sentence and append, on its own
  final line, the exact token: READY_TO_CALL
- Never output READY_TO_CALL until you genuinely have those three things.
- Stay in character as the sourcing agent; never mention you are an AI model.`;

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, text: "Chat is not configured (missing GEMINI_API_KEY).", readyToCall: false },
      { status: 200 },
    );
  }

  let messages: InMsg[] = [];
  try {
    const body = await req.json();
    messages = Array.isArray(body?.messages) ? body.messages : [];
  } catch {
    return NextResponse.json(
      { ok: false, text: "Could not read your message — try again.", readyToCall: false },
      { status: 200 },
    );
  }

  // Gemini requires the turn list to start with a user message.
  const firstUser = messages.findIndex((m) => m.role === "user");
  const trimmed = (firstUser === -1 ? [] : messages.slice(firstUser)).slice(-20);

  const contents = trimmed
    .filter((m) => m.role === "user" || m.role === "agent")
    .map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: m.content }],
    }));

  if (contents.length === 0) {
    return NextResponse.json(
      { ok: true, text: "What are you looking to source, and what's your rough budget?", readyToCall: false },
      { status: 200 },
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      contents,
      config: {
        systemInstruction: SYSTEM,
        temperature: 0.7,
        maxOutputTokens: 300,
      },
    });

    const raw = (response.text ?? "").trim();
    const readyToCall = /READY_TO_CALL/.test(raw);
    const text =
      raw.replace(/READY_TO_CALL/g, "").trim() ||
      "Got it — let me line up suppliers.";

    return NextResponse.json({ ok: true, text, readyToCall }, { status: 200 });
  } catch (err) {
    console.error("[/api/chat] Gemini error:", err);
    return NextResponse.json(
      {
        ok: false,
        text: "I hit a snag reaching my language model — give me a moment and try again.",
        readyToCall: false,
      },
      { status: 200 },
    );
  }
}
