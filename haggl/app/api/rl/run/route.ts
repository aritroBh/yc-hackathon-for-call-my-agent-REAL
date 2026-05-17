import { NextRequest, NextResponse } from "next/server";
import { tables } from "@/lib/db";
import { extractNegotiationPatterns } from "@/lib/patternExtraction";
import { buildTranscriptText } from "@/lib/aggregator";
import { updateDialectPrompt } from "@/lib/patternExtraction";

export async function POST(request: NextRequest) {
  try {
    // 1. Fetch all completed calls
    const { data: calls, error: callsErr } = await tables.calls
      .select("*")
      .eq("status", "completed");

    if (callsErr) {
      return NextResponse.json({ error: callsErr.message }, { status: 500 });
    }

    if (!calls || calls.length === 0) {
      return NextResponse.json({ newlyAnalyzedCount: 0, message: "No completed calls found." });
    }

    // 2. Fetch all processed call IDs from learned_patterns
    const { data: processed, error: procErr } = await tables.learned_patterns
      .select("call_id");

    if (procErr) {
      return NextResponse.json({ error: procErr.message }, { status: 500 });
    }

    const processedIds = new Set((processed || []).map((p) => p.call_id));

    // Filter to get unprocessed completed calls
    const unprocessedCalls = calls.filter((c) => !processedIds.has(c.id));

    if (unprocessedCalls.length === 0) {
      return NextResponse.json({ newlyAnalyzedCount: 0, message: "All completed calls have already been processed by RL." });
    }

    let newlyAnalyzedCount = 0;

    for (const call of unprocessedCalls) {
      // Fetch supplier
      const { data: supplier } = await tables.suppliers
        .select("*")
        .eq("id", call.supplier_id)
        .single();

      if (!supplier) continue;

      // Fetch feedback if any
      const { data: feedback } = await tables.feedback
        .select("*")
        .eq("call_id", call.id)
        .maybeSingle();

      // Fetch dialect config if associated
      let dialect = null;
      if (call.rfq_supplier_id) {
        const { data: rfqSupplier } = await tables.rfq_suppliers
          .select("dialect_id")
          .eq("id", call.rfq_supplier_id)
          .maybeSingle();

        if (rfqSupplier?.dialect_id) {
          const { data: dial } = await tables.dialect_configs
            .select("*")
            .eq("id", rfqSupplier.dialect_id)
            .single();
          dialect = dial;
        }
      }

      const region = supplier.metadata?.region || null;
      const dialectLocale = dialect?.locale || null;

      // Run pattern extraction
      const patterns = await extractNegotiationPatterns({
        callId: call.id,
        supplierId: call.supplier_id,
        supplierName: supplier.name,
        region,
        dialectLocale,
        transcriptText: buildTranscriptText(call.transcript || []),
        extraction: call.result,
        extractionError: call.error_message || undefined,
        feedbackRating: feedback?.rating || null,
        feedbackComment: feedback?.comment || null,
      });

      // Save learned patterns
      await tables.learned_patterns.insert({
        call_id: call.id,
        supplier_id: call.supplier_id,
        region,
        dialect_locale: dialectLocale,
        patterns,
      });

      // Update dialect config with reinforced patterns
      if (dialect) {
        const updatedPrompt = updateDialectPrompt(
          dialect.prompt_template,
          patterns,
          feedback && feedback.rating <= 2 ? "correct" : "reinforce"
        );

        await tables.dialect_configs
          .update({ prompt_template: updatedPrompt })
          .eq("id", dialect.id);
      }

      newlyAnalyzedCount++;
    }

    return NextResponse.json({
      newlyAnalyzedCount,
      message: `Successfully processed ${newlyAnalyzedCount} call(s) through RL pipeline.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
