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
      title: "Q1 Aluminum Brackets",
      description: "Need 5000 units of custom grade-T6 Aluminum bracket parts",
      items: [
        { sku: "AL-BRACKET-X", quantity: 5000, description: "Aluminum Brackets", unit: "units" },
      ],
      target_price: 50000,
      status: "negotiating",
    });

    // 4. Create Suppliers
    const suppliersData = [
      { id: uuid(), name: "AluMax Corp", contact_name: "John", phone: "+15551112222" },
      { id: uuid(), name: "Apex Metalwork", contact_name: "Sarah", phone: "+15553334444" },
      { id: uuid(), name: "Rapid Forge LLC", contact_name: "Mike", phone: "+15555556666" },
    ];

    for (const s of suppliersData) {
      await tables.suppliers.insert({
        id: s.id,
        organization_id: orgId,
        name: s.name,
        contact_name: s.contact_name,
        phone: s.phone,
        status: "active",
        metadata: { region: "North America" },
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
        status: s.name === "AluMax Corp" ? "agreed" : s.name === "Apex Metalwork" ? "declined" : "pending",
        priority: 50,
      }).select().single();
      rfqSuppliers.push(linked);
    }

    // 6. Seed Calls
    const aluMaxCallId = uuid();
    const apexCallId = uuid();
    const rapidCallId = uuid();

    // Call 1: Successful agreed call (AluMax Corp)
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
        { role: "assistant", content: "Hi, this is HAGGL Procurement. I'm calling regarding our RFQ for 5000 Aluminum Brackets." },
        { role: "user", content: "Ah yes, we received your RFQ. We can quote you $10 per unit, which is $50,000 total." },
        { role: "assistant", content: "That is our starting budget. Can we align on $8.40 per unit for an annual volume commitment?" },
        { role: "user", content: "Okay, we can do $8.40 per unit ($42,000 total) if you commit to Q2 orders as well. We can deliver in 12 days." },
        { role: "assistant", content: "Great! That is perfect. I will mark this as complete." }
      ],
      result: {
        quoted_price: 42000,
        lead_time_days: 12,
        certifications: ["ISO-9001", "AS9100"],
        communication_quality: 9,
        negotiation_effectiveness: 8,
        composite_score: 88,
        outcome: "agreed",
      }
    });

    // Call 2: Declined call (Apex Metalwork)
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
        { role: "assistant", content: "Hello, this is HAGGL Procurement. We are calling regarding our Aluminum Bracket RFQ." },
        { role: "user", content: "Hi. We looked at your specs, but unfortunately our tooling for T6 Aluminum is currently booked out for the next 3 months." }
      ],
      result: {
        quoted_price: null,
        lead_time_days: null,
        certifications: [],
        communication_quality: 7,
        negotiation_effectiveness: 2,
        composite_score: 45,
        outcome: "declined",
      }
    });

    // Call 3: Failed call (Rapid Forge LLC)
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
      error_message: "Twilio media connection timeout",
      result: null
    });

    // 7. Seed Reasoning Traces for AluMax Corp
    const traceOutput = {
      rebuttal_context: "Supplier quoted $10/unit.",
      facts: "Current market average for custom T6 Aluminum brackets is $8.20-$8.80/unit.",
      suggested_position: "Offer $8.40/unit with Q2 volume guarantee.",
      confidence: "high",
      injected_text: "We want to build a long-term relationship. Could you match the current market baseline of $8.40 in exchange for a Q2 commitment?",
    };

    await tables.reasoning_traces.insert({
      call_id: aluMaxCallId,
      trace_type: "live_intel_injection",
      provider: "claude",
      phase: "negotiation",
      input_data: {
        call_id: aluMaxCallId,
        supplier_turn: "We can quote you $10 per unit, which is $50,000 total.",
        negotiation_context: {
          partName: "Q1 Aluminum Brackets",
          quantity: 5000,
          targetPrice: 50000,
          currency: "USD",
          priority: "price",
        },
      },
      output_data: traceOutput,
      latency_ms: 1240,
    });

    // 8. Seed Feedback for AluMax Corp
    await tables.feedback.insert({
      call_id: aluMaxCallId,
      rfq_id: rfqId,
      supplier_id: suppliersData[0].id,
      user_id: userId,
      category: "pricing",
      rating: 5,
      comment: "Incredibly smooth price reduction! Reached $8.40/unit which is well below our budget.",
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
