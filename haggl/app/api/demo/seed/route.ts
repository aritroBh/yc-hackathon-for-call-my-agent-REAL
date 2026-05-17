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
      title: "West Africa Textile Import — Q2 2026",
      description: "Sourcing 5,000 units of traditional woven fabric from Ghana/Nigeria suppliers",
      items: [
        { sku: "KENTE-001", quantity: 5000, description: "Traditional woven kente fabric (48in width)", unit: "yards", target_unit_price: 8.50 }
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
        name: "Adebayo Manufacturing",
        contact_name: "Adebayo Okafor",
        phone: "+2348012345678",
        email: "adebayo@adebayomfg.ng",
        metadata: {
          language: "yoruba",
          region: "Lagos",
          country: "NG",
          specialization: "Garment manufacturing and export",
        }
      },
      {
        id: uuid(),
        name: "Ghana Agro Exports",
        contact_name: "Abena Asante",
        phone: "+233209876543",
        email: "abena@ghanaagro.com",
        metadata: {
          language: "akan",
          region: "Kumasi",
          country: "GH",
          specialization: "Cocoa and agricultural commodity export",
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
        status: s.name === "Kofi Textiles Ltd" ? "agreed" : s.name === "Adebayo Manufacturing" ? "declined" : "pending",
        priority: 50,
      }).select().single();
      rfqSuppliers.push(linked);
    }

    // 6. Seed Calls
    const aluMaxCallId = uuid();
    const apexCallId = uuid();
    const rapidCallId = uuid();

    // Call 1: Successful agreed call (Kofi Textiles Ltd)
    await tables.calls.insert({
      id: aluMaxCallId,
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

    // Call 2: Declined call (Adebayo Manufacturing)
    await tables.calls.insert({
      id: apexCallId,
      rfq_id: rfqId,
      supplier_id: suppliersData[1].id,
      rfq_supplier_id: rfqSuppliers[1].id,
      status: "completed",
      phase: "completed",
      duration_seconds: 92,
      cost_millicents: 12000,
      started_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
      ended_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
      transcript: [
        { role: "assistant", content: "Ẹ n lẹ o, Adebayo. I am calling from HAGGL regarding garment manufacturing capacity for 5,000 yards." },
        { role: "user", content: "Ẹ n lẹ o. We looked at your kente specs, but our handloom weavers are fully booked for the next 3 months. Unfortunately, we must decline this order." }
      ],
      result: {
        quoted_price: null,
        lead_time_days: null,
        certifications: ["WRAP-Certified"],
        communication_quality: 7,
        negotiation_effectiveness: 2,
        composite_score: 45,
        outcome: "declined",
      }
    });

    // Call 3: Failed call (Ghana Agro Exports)
    await tables.calls.insert({
      id: rapidCallId,
      rfq_id: rfqId,
      supplier_id: suppliersData[2].id,
      rfq_supplier_id: rfqSuppliers[2].id,
      status: "failed",
      phase: "failed",
      duration_seconds: 45,
      cost_millicents: 6000,
      started_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      ended_at: new Date(Date.now() - 1000 * 60 * 29).toISOString(),
      error_message: "AgentPhone media connection timeout",
      result: null
    });

    // 7. Seed Reasoning Traces for Kofi Textiles Ltd
    const traceOutput = {
      rebuttal_context: "Supplier quoted $10/yard.",
      facts: "Current local Ghana handloom baseline is $8.20-$8.80/yard.",
      suggested_position: "Offer $8.40/yard with Q2 textile volume commitment.",
      confidence: "high",
      injected_text: "We want to build a long-term relationship. Could you match the current Kumasi market baseline of $8.40 in exchange for a Q2 commitment?",
    };

    await tables.reasoning_traces.insert({
      call_id: aluMaxCallId,
      trace_type: "live_intel_injection",
      provider: "claude",
      phase: "negotiating",
      input_data: {
        call_id: aluMaxCallId,
        supplier_turn: "Our standard export price is $10 per yard, which is $50,000.",
        negotiation_context: {
          partName: "West Africa Textile Import — Q2 2026",
          quantity: 5000,
          targetPrice: 42500,
          currency: "USD",
          priority: "price",
        },
      },
      output_data: traceOutput,
      latency_ms: 1240,
    });

    // 8. Seed Feedback for Kofi Textiles Ltd
    await tables.feedback.insert({
      call_id: aluMaxCallId,
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
      calls: { aluMaxCallId, apexCallId, rapidCallId }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
