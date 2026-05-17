/**
 * HAGGL Seed Demo Data Generator
 *
 * Generates a complete demo dataset: RFQ + 6 suppliers + completed calls
 * with transcripts, results, and scoring data.
 *
 * Usage: npx tsx scripts/generate-seed.ts
 *
 * Output: prints JSON to stdout. Pipe to a file or POST to the API.
 */

const DEMO_RFQ = {
  title: "Steel Pipe & Fittings — Q3 Procurement",
  description:
    "We require 5,000 meters of Schedule 40 steel pipe (2in, 3in, 4in diameters) plus associated fittings for Q3 infrastructure projects. Suppliers must be ISO 9001 certified and capable of delivering within 30 days. Target pricing is $12.50/meter blended. Floor is $9.80/meter.",
  target_price: 62500,
  floor_price: 49000,
  currency: "USD",
  deadline: new Date(Date.now() + 14 * 86400000).toISOString(),
  aggressiveness: "high",
  priority: "cost_savings",
  items: [
    { sku: "SP-2-40", description: "2in Schedule 40 Steel Pipe", quantity: 2000, unit: "meters", target_unit_price: 10.5 },
    { sku: "SP-3-40", description: "3in Schedule 40 Steel Pipe", quantity: 1800, unit: "meters", target_unit_price: 13.2 },
    { sku: "SP-4-40", description: "4in Schedule 40 Steel Pipe", quantity: 1200, unit: "meters", target_unit_price: 16.8 },
    { sku: "FL-150", description: "150# Flanged Fittings Set", quantity: 120, unit: "sets", target_unit_price: 45.0 },
    { sku: "EL-90-3", description: "3in 90° Elbow Fittings", quantity: 300, unit: "pieces", target_unit_price: 4.5 },
  ],
};

const DEMO_SUPPLIERS = [
  { name: "Apex Steel Corp", phone: "+1-312-555-0142", email: "quotes@apexsteel.com", contact_name: "James Mitchell", country: "US", region: "Midwest" },
  { name: "Bharat Pipe Mills", phone: "+91-22-4567-8901", email: "exports@bharatpipe.in", contact_name: "Priya Sharma", country: "IN", region: "Maharashtra" },
  { name: "Sino-Metal Trading", phone: "+86-21-5556-7890", email: "sales@sinometal.cn", contact_name: "Wei Zhang", country: "CN", region: "Shanghai" },
  { name: "Gulf Industrial Supply", phone: "+971-4-555-1234", email: "info@gulfind.ae", contact_name: "Ahmed Al-Rashid", country: "AE", region: "Dubai" },
  { name: "EuroPipe GmbH", phone: "+49-40-555-6789", email: "verkauf@europipe.de", contact_name: "Klaus Weber", country: "DE", region: "Hamburg" },
  { name: "Nippon Steel Trading", phone: "+81-3-5555-7890", email: "trade@nipponsteel.co.jp", contact_name: "Kenji Tanaka", country: "JP", region: "Tokyo" },
];

const DEMO_TRANSCRIPTS: Record<string, { agent: string[]; supplier: string[] }> = {
  "Apex Steel Corp": {
    agent: [
      "Hello, this is an AI-powered assistant calling from HAGGL. This call may be recorded for quality purposes.",
      "We're looking to procure steel pipe and fittings for Q3. Can you provide a quote for 5,000 meters across 2in, 3in, and 4in Schedule 40 pipe plus fittings?",
      "Thank you. Our target pricing is around $12.50/meter blended. Does that align with your current rates?",
      "I understand steel prices have been volatile, but we've received more competitive quotes from other suppliers. Can you do better on the 3in and 4in pipe?",
      "We have a firm offer from another supplier at $11.80/meter on the 2in pipe. Can you match that if we increase the 2in volume to 2,500 meters?",
      "With the ISO certification and your lead time, we'd like to move forward. Can you confirm $11,900 for the 2in, $12.40 for 3in, and $15.20 for 4in?",
      "Perfect. We'll proceed with those terms. Please send the formal PO acknowledgment to our procurement team.",
    ],
    supplier: [
      "This is James. Go ahead.",
      "We can definitely help with that. Let me pull current pricing. For Schedule 40, we're looking at $12.80/meter blended right now. Steel prices are up about 8% this quarter due to raw material costs and new tariffs.",
      "Well, $12.50 is tight. Our costs have gone up — the new Section 301 tariffs on imported steel inputs are hitting us. Best I can do is $12.30 blended if you commit to the full 5,000 meters.",
      "Let me check. For 3in I could do $12.80 and 4in at $16.20. That's the best we can offer — our mill costs are non-negotiable at these volumes.",
      "Alright, $11.90 on the 2in if you take 2,500. That's below our normal margin but we want the business. 3in at $12.50, 4in at $15.50.",
      "I can confirm $11.90 for 2in, $12.40 for 3in, and $15.20 for 4in. Payment Net 45, delivery 3-4 weeks from order. We'll include the ISO certs with shipment.",
      "You'll have the PO acknowledgment within 24 hours. Good doing business.",
    ],
  },
  "Bharat Pipe Mills": {
    agent: [
      "Hello, this is an AI assistant from HAGGL calling on behalf of a buyer. This call may be recorded.",
      "We're looking to source steel pipe for infrastructure projects. Can you provide pricing for Schedule 40 pipe in 2in, 3in, and 4in diameters?",
      "Thanks, Priya. Our target is around $12.50/meter blended FOB. How does that compare to your current export pricing?",
      "The MoQ of 10,000 meters is quite high for us — we need about 5,000 meters. Can you accommodate a smaller initial order?",
      "We appreciate the flexibility. On price, we have competitive offers from domestic suppliers. Can you review your pricing on the 4in pipe?",
      "If you can do $15.10 on the 4in and confirm delivery within 25 days, we can move forward. Also, do you have ISO 9001 and BIS certifications current?",
      "Excellent. Please send the formal quote to our procurement team and we'll issue the PO.",
    ],
    supplier: [
      "Good day! Priya speaking. This is an AI calling? Interesting. Go ahead with your requirements.",
      "Of course, sir. For Schedule 40, our export price is $11.90/meter blended FOB Mumbai. That's very competitive given that domestic Indian prices have risen 6% due to new BIS certification requirements.",
      "We can work with that. Our price is already below $12.50. For 2in, $10.80. 3in, $12.20. 4in, $15.80. But our minimum order is 10,000 meters for export.",
      "We can do 5,000 meters as a trial order at the same pricing. We want to build the relationship with your company.",
      "For 4in, I can reduce to $15.60. That's our bottom — raw material costs from our mill have gone up. We use prime Indian HR coil which is now $720/ton.",
      "Yes, we have both ISO 9001:2015 and BIS certifications. Delivery we can do 25 days from order confirmation. Payment terms are LC or 30% advance.",
      "We'll send the quote today. Looking forward to working with you.",
    ],
  },
  "Sino-Metal Trading": {
    agent: [
      "Hello, this is an AI assistant from HAGGL. This call may be recorded. Am I speaking with Wei Zhang?",
      "We need Schedule 40 steel pipe for Q3 delivery. Can you quote on 5,000 meters across 2in, 3in, and 4in diameters plus fittings?",
      "$11.20/meter blended is interesting. What about the 3in and 4in pricing specifically? And what are your current lead times?",
      "The lead time is a concern — we need delivery within 30 days. Can you expedite?",
      "I understand the shipping challenges, but 45 days is too long. Our project timeline is tight. Can you split the order? Partial air freight for the 2in pipe to get us started?",
      "Alright. What's your best price for 3,000 meters of 2in pipe with 25-day delivery? We'll source the remaining elsewhere.",
      "That works. We'll take 3,000 meters of 2in at $9.90/meter CIF. Please send the commercial invoice and we'll proceed.",
    ],
    supplier: [
      "Yes, Wei Zhang here. Go ahead.",
      "For Schedule 40, our FOB Shanghai price is $11.20/meter blended. Very competitive. For 2in, $9.50. 3in, $11.80. 4in, $14.60. Steel plate prices have been stable this quarter.",
      "Lead time is 35-45 days depending on shipping. Ocean freight rates have come down 15% from last quarter, which helps.",
      "Expediting is difficult — our mill is running at 90% capacity. We have orders backed up. The shipping is the constraint, not production.",
      "We could do 25 days for 2in pipe only if we use a faster shipping line. It would add about $0.30/meter to the cost. For the full order, 45 days is the best we can do.",
      "For 3,000 meters 2in pipe with 25-day delivery via express line, $9.90/meter CIF Los Angeles. Price includes the faster shipping surcharge.",
      "I'll have the invoice sent within 24 hours. Thank you for the order.",
    ],
  },
  "Gulf Industrial Supply": {
    agent: [
      "Good day, this is an AI assistant from HAGGL calling on behalf of a buyer. This call may be recorded.",
      "We're sourcing steel pipe for infrastructure projects in the Gulf region. Can you provide a quote on Schedule 40 pipe?",
      "Your pricing is high compared to other quotes we've received. The 2in at $13.20 is significantly above market. What's driving that?",
      "Let's talk about the 3in and 4in pipe. Can you do $13.80 for 3in and $17.50 for 4in if we commit to the full volume?",
      "That's still above our target. We have an offer from Bharat Pipe Mills at $12.20/meter for 3in FOB. Can you match that?",
      "What about including the fittings in that price? We need 120 sets of flanged fittings and 300 elbows. If you bundle everything, can you get to $14.80/meter blended?",
      "Understood. We may come back to you if other suppliers fall through.",
    ],
    supplier: [
      "Hello! Ahmed Al-Rashid speaking. How can I help?",
      "We stock Schedule 40 pipe from European mills. Current pricing: 2in at $13.20/meter, 3in at $15.80, 4in at $19.20. All certified to ISO and EN standards. Delivery within 20 days from our Dubai warehouse.",
      "The pricing reflects the quality — we source from EU mills, not Asian imports. You're paying for consistent quality, full traceability, and fast delivery from stock.",
      "The best I can do is $15.20 for 3in and $18.50 for 4in. Our costs have increased due to new EU carbon border adjustment mechanism (CBAM) regulations.",
      "I'm sorry, I can't match Indian pricing. Their quality standards are different. Our 3in pipe is EN 10216 certified with full mill test certificates. You get what you pay for.",
      "With fittings included, I could do $16.20/meter blended. That's a 5% discount for the full package. Delivery within 20 days from stock with full certification.",
      "No problem. The offer stands for 30 days. Feel free to reach out if you need premium quality with fast delivery.",
    ],
  },
  "EuroPipe GmbH": {
    agent: [
      "Guten Tag, this is an AI assistant from HAGGL. Am I speaking with Klaus Weber?",
      "We need Schedule 40 steel pipe for a Q3 project. Can you provide pricing for 5,000 meters across 2in, 3in, and 4in diameters?",
      "$14.50/meter is above our target. Can you explain the pricing breakdown?",
      "The energy cost surcharge is difficult for us. We have fixed budgets. Can you absorb some of that for a larger order?",
      "We could commit to 6,000 meters instead of 5,000 if you can get to $13.50/meter. That's a significant volume increase.",
      "If we go with 6,000 meters at $13.80, can you confirm delivery within 28 days and include EN 10210 certification?",
      "We'll take that to our procurement team. Please send the formal offer.",
    ],
    supplier: [
      "Ja, Klaus Weber hier. How can I help you today?",
      "For Schedule 40, our current price is $14.50/meter EXW Hamburg. This includes full EN certification and mill traceability. Steel prices have risen due to energy costs in Europe.",
      "Our energy costs have increased 40% year-over-year. European mills are struggling. We have a 12% energy surcharge on all orders. Quality remains excellent, but European steel is expensive right now.",
      "For a 5,000 meter order, I could reduce to $14.00/meter. I cannot absorb the energy surcharge — it's a pass-through from our mill.",
      "For 6,000 meters, $13.80/meter. That would be my final offer. The quality is superior to any non-European supplier.",
      "28 days is possible. EN 10210 certification included. Payment 30 days net. I'll prepare the offer.",
      "You'll have it by end of day. Auf Wiedersehen.",
    ],
  },
  "Nippon Steel Trading": {
    agent: [
      "Hello, this is an AI assistant from HAGGL calling. May I speak with Kenji Tanaka?",
      "We're interested in procuring steel pipe for infrastructure. Can you quote on Schedule 40 pipe for Q3 delivery?",
      "Thank you, Kenji. Your pricing is competitive but the MoQ of 8,000 meters is a challenge — we need about 5,000. Is there flexibility?",
      "$12.90/meter is reasonable. Can you break down pricing per diameter? And what certifications do you hold?",
      "The CIF pricing including shipping helps. Our timeline requires delivery within 30 days — is that feasible from Japan?",
      "We appreciate the detailed breakdown. Can you offer a volume discount if we increase to 6,000 meters?",
      "Let me discuss with our team. One more question — are you able to provide JIS G3454 certification with the shipment?",
      "Thank you for your time, Kenji. Please send the quote and we'll be in touch.",
    ],
    supplier: [
      "Hai, Kenji Tanaka desu. How can I assist you today?",
      "Of course. For Schedule 40, our CIF Los Angeles price is $12.90/meter blended. That includes all shipping and insurance. Very competitive given the current yen weakness.",
      "We can accommodate 5,000 meters as a first order. We want to build long-term relationship with your company.",
      "For 2in: $11.20/meter. 3in: $13.40/meter. 4in: $16.80/meter. We hold ISO 9001, JIS G3454, and API 5L certifications. Quality is our priority.",
      "30 days is achievable. Our logistics team in Yokohama coordinates with major shipping lines. We can guarantee 28-day delivery from order confirmation.",
      "For 6,000 meters, I can offer $12.60/meter blended — a 2.3% discount. That's our maximum flexibility given current raw material costs.",
      "Yes, JIS G3454 certification is standard with all our shipments. Full mill test reports included. We pride ourselves on documentation quality.",
      "You're welcome. I'll have the quote prepared today. We look forward to a long partnership.",
    ],
  },
};

const DEMO_RESULTS: Record<string, { price: number | null; confidence: number; terms: string | null; delivery: string | null }> = {
  "Apex Steel Corp": { price: 62300, confidence: 85, terms: "Net 45", delivery: "3-4 weeks" },
  "Bharat Pipe Mills": { price: 59750, confidence: 75, terms: "LC or 30% advance", delivery: "25 days" },
  "Sino-Metal Trading": { price: 29700, confidence: 70, terms: "Letter of Credit", delivery: "25 days" },
  "Gulf Industrial Supply": { price: null, confidence: 40, terms: null, delivery: null },
  "EuroPipe GmbH": { price: 82800, confidence: 65, terms: "Net 30", delivery: "28 days" },
  "Nippon Steel Trading": { price: 75600, confidence: 80, terms: "Net 30", delivery: "28 days" },
};

function buildTranscript(supplierName: string): any[] {
  const t = DEMO_TRANSCRIPTS[supplierName];
  if (!t) return [];
  const lines: any[] = [];
  const now = Date.now() - 300000;

  const allLines: { role: "agent" | "supplier"; text: string }[] = [];
  const maxLen = Math.max(t.agent.length, t.supplier.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < t.agent.length) allLines.push({ role: "agent", text: t.agent[i] });
    if (i < t.supplier.length) allLines.push({ role: "supplier", text: t.supplier[i] });
  }

  allLines.forEach((l, i) => {
    lines.push({
      role: l.role,
      content: l.text,
      timestamp: new Date(now + i * 15000).toISOString(),
    });
  });

  return lines;
}

function generateSeedData() {
  const now = new Date();
  const createdAt = new Date(now.getTime() - 3600000 * 2).toISOString();
  const startedAt = new Date(now.getTime() - 1800000).toISOString();
  const endedAt = new Date(now.getTime() - 600000).toISOString();

  const suppliers = DEMO_SUPPLIERS.map((s, i) => ({
    ...s,
    supplier_id: `seed-supplier-${i + 1}`,
    dialect_id: null,
    priority: 100 - i * 10,
    status: DEMO_RESULTS[s.name].price != null ? "agreed" : "declined",
    notes: DEMO_RESULTS[s.name].confidence >= 70 ? "Strong negotiation outcome" : "Price expectations not met",
  }));

  const calls = DEMO_SUPPLIERS.map((s) => {
    const result = DEMO_RESULTS[s.name];
    return {
      id: `seed-call-${s.name.toLowerCase().replace(/\s+/g, "-")}`,
      supplier_id: suppliers.find((x) => x.name === s.name)!.supplier_id,
      status: result.price != null ? "completed" : "completed",
      phase: result.price != null ? "completed" : "completed",
      duration_seconds: Math.floor(180 + Math.random() * 240),
      cost_millicents: Math.floor(200 + Math.random() * 500),
      transcript: buildTranscript(s.name),
      result: {
        quoted_price: result.price,
        confidence_score: result.confidence,
        quoted_terms: result.terms,
        delivery_timeline: result.delivery,
        supplier_name: s.name,
      },
      error_message: null,
      started_at: startedAt,
      ended_at: endedAt,
      created_at: createdAt,
    };
  });

  const extraction = DEMO_SUPPLIERS.map((s) => {
    const result = DEMO_RESULTS[s.name];
    return {
      supplier_id: suppliers.find((x) => x.name === s.name)!.supplier_id,
      supplier_name: s.name,
      quoted_price: result.price,
      currency: "USD",
      lead_time_days: result.delivery ? parseInt(result.delivery) || 28 : null,
      delivery_terms: "CIF",
      certifications: s.name.includes("Apex") ? ["ISO 9001", "API 5L"] :
        s.name.includes("Bharat") ? ["ISO 9001", "BIS"] :
        s.name.includes("Sino") ? ["ISO 9001"] :
        s.name.includes("Gulf") ? ["ISO 9001", "EN 10216"] :
        s.name.includes("EuroPipe") ? ["EN 10210", "ISO 9001"] :
        ["ISO 9001", "JIS G3454"],
      minimum_order_quantity: s.name.includes("Sino") ? 3000 :
        s.name.includes("Nippon") ? 5000 : null,
      moq_unit: "meters",
      payment_terms: result.terms,
      communication_quality: result.confidence >= 75 ? 8 : result.confidence >= 60 ? 7 : 6,
      negotiation_effectiveness: result.confidence >= 75 ? 8 : result.confidence >= 60 ? 6 : 5,
      confidence: result.confidence / 100,
    };
  });

  const scoring = {
    weights: { price: 0.40, lead_time: 0.25, communication: 0.15, reliability: 0.20 },
    target_price: 62500,
    floor_price: 49000,
  };

  const sampleOutput = {
    _metadata: {
      title: "HAGGL Seed Demo Data — Steel Pipe Procurement",
      generated_at: new Date().toISOString(),
      note: "This data is designed for dashboard screenshots and demo purposes. Run with npx tsx scripts/generate-seed.ts",
    },
    rfq: DEMO_RFQ,
    suppliers,
    calls,
    extractions: extraction,
    scoring,
  };

  return sampleOutput;
}

const data = generateSeedData();
console.log(JSON.stringify(data, null, 2));
