import { NextRequest, NextResponse } from "next/server";
import { tables } from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function POST(request: NextRequest) {
  try {
    const orgId = "00000000-0000-0000-0000-000000000001";
    const userId = "00000000-0000-0000-0000-000000000001";

    // 1. Ensure Organization
    await tables.users.upsert(
      {
        id: userId,
        organization_id: orgId,
        email: "demo@haggl.ai",
        name: "Demo User",
        role: "admin",
        is_active: true,
      },
      { onConflict: "id" }
    );

    // 2. Ensure Dialect Config for US East
    const { data: dialect } = await tables.dialect_configs.upsert(
      {
        name: "US East (RL-Optimized)",
        locale: "en-US-East",
        prompt_template: "Default US East Dialect Template",
        speaking_style: "Clear and direct",
        formality_level: "semi_formal",
        is_active: true,
      },
      { onConflict: "locale" }
    ).select().single();

    // 3. Create RFQ
    const rfqId = uuid();
    await tables.rfqs.insert({
      id: rfqId,
      organization_id: orgId,
      created_by: userId,
      title: "Multi-Supplier Textile Procurement — Ghana & India",
      description: "Sourcing 5,000 yards of woven fabric from West Africa and South Asia",
      items: [
        { sku: "FABRIC-001", quantity: 5000, description: "Export-quality woven fabric (48in width)", unit: "yards", target_unit_price: 8.50 }
      ],
      target_price: 42500,
      currency: "USD",
      status: "negotiating",
    });

    // 4. Create Suppliers
    const suppliersData = [
      {
        id: uuid(),
        name: "Kofi Textiles Ltd",
        contact_name: "Kofi Mensah",
        phone: "+233501234567",
        email: "kofi@kofitextiles.com.gh",
        metadata: {
          language: "twi",
          region: "Accra",
          country: "GH",
          specialization: "Kente cloth and traditional textiles",
        }
      },
      {
        id: uuid(),
        name: "Rajesh Fabrics Pvt Ltd",
        contact_name: "Rajesh Kumar",
        phone: "+911234567890",
        email: "rajesh@rajeshfabrics.in",
        metadata: {
          language: "hindi",
          region: "Ludhiana",
          country: "IN",
          specialization: "Woolen fabric and textile export",
        }
      },
    ];

    for (const s of suppliersData) {
      await tables.suppliers.insert({
        id: s.id,
        organization_id: orgId,
        name: s.name,
        contact_name: s.contact_name,
        phone: s.phone,
        status: "active",
        metadata: s.metadata,
      });
    }

    // 5. Link Suppliers to RFQ
    const rfqSuppliers = [];
    for (const s of suppliersData) {
      const { data: linked } = await tables.rfq_suppliers.insert({
        id: uuid(),
        rfq_id: rfqId,
        supplier_id: s.id,
        dialect_id: dialect?.id || null,
        status: "agreed",
        priority: 50,
      }).select().single();
      rfqSuppliers.push(linked);
    }

    // 6. Seed Calls
    const twiCallId = uuid();
    const hindiCallId = uuid();

    // Call 1: Kofi Textiles Ltd (Ghana) — negotiated in Twi, agreed
    await tables.calls.insert({
      id: twiCallId,
      rfq_id: rfqId,
      supplier_id: suppliersData[0].id,
      rfq_supplier_id: rfqSuppliers[0].id,
      status: "completed",
      phase: "completed",
      duration_seconds: 156,
      cost_millicents: 23000,
      started_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
      ended_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
      transcript: [
        { role: "assistant", content: "Mema wo akye, Owura Kofi. Mefrɛ wo firi HAGGL, yɛpɛ kente ntama 5,000 yards. Wubɛtumi de boɔ bi ma me?" },
        { role: "user", content: "Aane, yɛtumi yɛ. Yɛn boɔ piesie ne $10 saa yard biara, enti yɛbɛhia $50,000 nyinaa." },
        { role: "assistant", content: "Owura Kofi, yɛpɛ sɛ yɛyɛ adwuma bɔne wɔ Q2. Sɛ yɛde $8.40 saa yard biara ne $42,000 nyinaa a, ɛbɛyɛ yiye anaa?" },
        { role: "user", content: "Ɛyɛ! Efisɛ wobɛkasa yɛn kasa na wuhu yɛn amammerɛ, yɛbɛne agyree wɔ $8.40 saa yard biara. Mɛyɛ invoice no nnɛ." }
      ],
      result: {
        quoted_price: 42000,
        lead_time_days: 12,
        certifications: ["AGOA-Certified", "Ghana Standards Authority (GSA)"],
        communication_quality: 9,
        negotiation_effectiveness: 8,
        composite_score: 88,
        outcome: "agreed",
      }
    });

    // Call 2: Rajesh Fabrics Pvt Ltd (India) — negotiated in Hindi, agreed
    await tables.calls.insert({
      id: hindiCallId,
      rfq_id: rfqId,
      supplier_id: suppliersData[1].id,
      rfq_supplier_id: rfqSuppliers[1].id,
      status: "completed",
      phase: "completed",
      duration_seconds: 198,
      cost_millicents: 26000,
      started_at: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
      ended_at: new Date(Date.now() - 1000 * 60 * 19).toISOString(),
      transcript: [
        { role: "assistant", content: "Namaste ji! Main HAGGL ki taraf se Rajesh ji se baat karna chahta hoon. Kya aap available hain?" },
        { role: "user", content: "Haan ji, main Rajesh bol raha hoon. Bataiye, kya kaam hai aapka?" },
        { role: "assistant", content: "Rajesh ji, humein 5,000 yards woolen fabric chahiye — export quality. Aapka kya rate hoga per yard?" },
        { role: "user", content: "Ji, hamara standard export rate hai $12 per yard. Lekin quantity ke hisaab se kuch adjustment ho sakta hai." },
        { role: "assistant", content: "Rajesh ji, yeh thoda zyada lag raha hai. Ludhiana market mein $9.50 ka rate chal raha hai is quality ke liye. Kya aap $9.80 per yard mein de sakte hain? Hum regular orders denge." },
        { role: "user", content: "Aapne sahi kaha ji. Aap hamare purane customer ban jaoge toh main $10.20 mein kar sakta hoon. Isse kam karna mushkil hai." },
        { role: "assistant", content: "Rajesh ji, hum Q2 aur Q3 dono mein order denge — total 10,000 yards. Iss commitment ke saath kya $9.90 per yard ho sakta hai? Yeh long-term partnership ka shuruaat hoga." },
        { role: "user", content: "Haan ji, 10,000 yards ke liye main $9.90 maan sakta hoon. Bahut achha! Agreement ho gaya. Main invoice bhej deta hoon." }
      ],
      result: {
        quoted_price: 49500,
        lead_time_days: 45,
        certifications: ["OEKO-TEX Standard 100", "BIS Certified", "FIEO Member"],
        communication_quality: 9,
        negotiation_effectiveness: 9,
        composite_score: 91,
        outcome: "agreed",
      }
    });

    // 7. Seed Reasoning Trace for Kofi Textiles Ltd (Twi intel injection)
    const traceOutput = {
      rebuttal_context: "Supplier anchored at $10/yard — 19% above the Moss market rate of $8.40/yard.",
      facts: "Kente cloth market rate 2026: machine-woven $8.40–$8.80/yard (Moss). Local Ghana handloom baseline $8.20–$8.80/yard.",
      suggested_position: "Counter at $8.40/yard citing AGOA import volumes and a Q2 commitment.",
      confidence: "high",
      moss_facts: ["Kente cloth benchmark: $8–11/yard machine woven", "Kumasi handloom baseline: $8.20–$8.80/yard"],
      supermemory_context: "Prior Kofi Textiles deal settled at $8.40/yard in Q4 2025.",
      injected_text: "We want to build a long-term relationship. Could you match the current Kumasi market baseline of $8.40 in exchange for a Q2 commitment?",
    };

    await tables.reasoning_traces.insert({
      call_id: twiCallId,
      trace_type: "live_intel_injection",
      provider: "claude",
      phase: "negotiating",
      input_data: {
        call_id: twiCallId,
        supplier_turn: "Aane, yɛtumi yɛ. Yɛn boɔ piesie ne $10 saa yard biara, enti yɛbɛhia $50,000 nyinaa.",
        negotiation_context: {
          partName: "Multi-Supplier Textile Procurement — Ghana & India",
          quantity: 5000,
          targetPrice: 42500,
          currency: "USD",
          priority: "price",
        },
      },
      output_data: traceOutput,
      tokens_used: 280,
      latency_ms: 1840,
    });

    // Reasoning Trace for Rajesh Fabrics (Hindi intel injection — Moss + Supermemory)
    await tables.reasoning_traces.insert({
      call_id: hindiCallId,
      trace_type: 'live_intel_injection',
      provider: 'gemini',
      phase: 'negotiating',
      input_data: {
        supplier_turn: "hamara standard export rate hai $12 per yard",
        call_id: hindiCallId,
      },
      output_data: {
        rebuttal_context: "Supplier anchored at $12/yard — Moss market data shows Ludhiana woolen export at $9.50/yard",
        facts: "Ludhiana woolen fabric export benchmark 2026: $9.50–$10.20/yard for 5,000+ unit orders",
        suggested_position: "Counter at $9.80/yard citing Ludhiana market rate and long-term volume commitment",
        confidence: "high",
        moss_facts: [
          "India textile pricing: Wool sweater Ludhiana $8–15/unit",
          "Volume commitment unlocks 12–15% discount from Indian suppliers",
        ],
        supermemory_context: "Hindi suppliers respond well to long-term partnership framing over single-order pressure",
        injected_text: "[LIVE INTEL] Market $9.50/yard vs ask $12. Counter at $9.80 with volume commitment.",
      },
      tokens_used: 265,
      latency_ms: 1620,
    });

    // 8. Seed Feedback for Kofi Textiles Ltd
    await tables.feedback.insert({
      call_id: twiCallId,
      rfq_id: rfqId,
      supplier_id: suppliersData[0].id,
      user_id: userId,
      category: "pricing",
      rating: 5,
      comment: "Incredibly smooth price reduction! Reached $8.40/yard which is well below our budget using direct native Twi cultural alignment.",
    });

    return NextResponse.json({
      success: true,
      message: "Demo seeded successfully!",
      rfqId,
      calls: { twiCallId, hindiCallId }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
