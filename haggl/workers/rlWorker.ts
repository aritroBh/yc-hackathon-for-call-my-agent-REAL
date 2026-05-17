import "dotenv/config";
import { tables, getRFQById, getSupplierById, getDecryptedFloorPrice } from "@/lib/db";
import { buildTranscriptText, extractCallData } from "@/lib/aggregator";
import { extractNegotiationPatterns, updateDialectPrompt, type NegotiationPatterns } from "@/lib/patternExtraction";
import { getDialectByLocale, type DialectContext } from "@/lib/prompts/dialectPrompts";
import type { CallRow, FeedbackRow, DialectConfigRow } from "@/types/database";

interface RLWorkerOptions {
  batchSize?: number;
  concurrency?: number;
  dryRun?: boolean;
  sinceHoursAgo?: number;
}

interface RLReport {
  started_at: string;
  completed_at: string;
  calls_processed: number;
  patterns_extracted: number;
  dialects_updated: number;
  failures: number;
  total_savings: number;
  awards_made: number;
  per_call: RLCallResult[];
}

interface RLCallResult {
  call_id: string;
  supplier_name: string;
  status: "success" | "skipped" | "failed";
  overall_score: number;
  patterns_count: number;
  savings: number | null;
  error?: string;
  dialect_updated?: boolean;
}

const DEFAULT_OPTIONS: Required<RLWorkerOptions> = {
  batchSize: 25,
  concurrency: 3,
  dryRun: false,
  sinceHoursAgo: 24,
};

export class RLWorker {
  private running = false;
  private opts: Required<RLWorkerOptions>;

  constructor(opts?: RLWorkerOptions) {
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
  }

  get isRunning(): boolean {
    return this.running;
  }

  async runOnce(): Promise<RLReport> {
    this.running = true;
    const startedAt = new Date().toISOString();
    const report: RLReport = {
      started_at: startedAt,
      completed_at: startedAt,
      calls_processed: 0,
      patterns_extracted: 0,
      dialects_updated: 0,
      failures: 0,
      total_savings: 0,
      awards_made: 0,
      per_call: [],
    };

    try {
      console.log("[RLWorker] Starting nightly RL pipeline...");
      const calls = await this.fetchCandidateCalls();

      if (calls.length === 0) {
        console.log("[RLWorker] No candidate calls found");
        report.completed_at = new Date().toISOString();
        return report;
      }

      console.log(`[RLWorker] Processing ${calls.length} candidate calls`);

      const batches: CallRow[][] = [];
      for (let i = 0; i < calls.length; i += this.opts.batchSize) {
        batches.push(calls.slice(i, i + this.opts.batchSize));
      }

      for (const batch of batches) {
        const batchResults = await Promise.all(
          batch.map((call) => this.processCall(call)),
        );

        for (const result of batchResults) {
          report.per_call.push(result);
          if (result.status === "success") {
            report.calls_processed++;
            report.patterns_extracted++;
            if (result.savings != null) report.total_savings += result.savings;
          } else if (result.status === "failed") {
            report.failures++;
          }
        }
      }

      report.completed_at = new Date().toISOString();
      console.log(`[RLWorker] Pipeline complete: ${report.calls_processed} processed, ${report.dialects_updated} dialects updated, ${report.failures} failures`);
    } catch (err) {
      console.error("[RLWorker] Pipeline error:", err);
    } finally {
      this.running = false;
    }

    return report;
  }

  private async fetchCandidateCalls(): Promise<CallRow[]> {
    const since = new Date(Date.now() - this.opts.sinceHoursAgo * 3600_000).toISOString();

    const { data: completedCalls } = await tables.calls
      .select("*")
      .in("status", ["completed"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!completedCalls || (completedCalls as CallRow[]).length === 0) return [];

    const allCalls = completedCalls as CallRow[];

    const { data: allFeedback } = await tables.feedback
      .select("call_id, rating, comment, category")
      .in("call_id", allCalls.map((c) => c.id));

    const feedbackMap = new Map<string, FeedbackRow[]>();
    if (allFeedback) {
      (allFeedback as FeedbackRow[]).forEach((f) => {
        const existing = feedbackMap.get(f.call_id) || [];
        existing.push(f);
        feedbackMap.set(f.call_id, existing);
      });
    }

    return allCalls.filter((c) => feedbackMap.has(c.id));
  }

  private async processCall(call: CallRow): Promise<RLCallResult> {
    try {
      const supplier = await getSupplierById(call.supplier_id);
      const supplierName = supplier?.name || "Unknown";
      const region = (supplier?.metadata as Record<string, unknown> | null)?.region as string | null || null;
      const country = (supplier?.metadata as Record<string, unknown> | null)?.country as string | null || null;

      const inferredLocale = this.inferLocale(region, country);
      const dialect = inferredLocale ? getDialectByLocale(inferredLocale) : null;

      const transcriptText = buildTranscriptText(call.transcript || []);
      const rfq = call.rfq_id ? await getRFQById(call.rfq_id) : null;
      const floorPrice = call.rfq_id ? await getDecryptedFloorPrice(call.rfq_id) : null;

      const itemsStr = rfq?.items
        ? (rfq.items as any[]).map((i: any) => `${i.quantity || "?"} ${i.unit || "units"} of ${i.description || i.sku}`).join("; ")
        : "Not specified";

      const extraction = await extractCallData({
        callId: call.id,
        supplierId: call.supplier_id,
        supplierName,
        transcriptText,
        rfqContext: "RFQ: " + (rfq?.title || "Unknown") + " | Items: " + itemsStr + " | Supplier: " + supplierName,
      });

      const { data: feedbacks } = await tables.feedback
        .select("rating, comment")
        .eq("call_id", call.id);

      let avgRating: number | null = null;
      let latestComment: string | null = null;

      if (feedbacks && (feedbacks as Pick<FeedbackRow, "rating" | "comment">[]).length > 0) {
        const fb = feedbacks as Pick<FeedbackRow, "rating" | "comment">[];
        avgRating = fb.reduce((s, f) => s + f.rating, 0) / fb.length;
        latestComment = fb[fb.length - 1]?.comment || null;
      }

      const patterns = await extractNegotiationPatterns({
        callId: call.id,
        supplierId: call.supplier_id,
        supplierName,
        region,
        dialectLocale: inferredLocale,
        transcriptText,
        extraction: extraction.error ? null : extraction,
        extractionError: extraction.error || undefined,
        feedbackRating: avgRating,
        feedbackComment: latestComment,
      });

      const result = call.result as Record<string, unknown> | null;
      const quotedPrice = result ? (result.quoted_price as number | undefined) ?? null : null;
      const savings = rfq?.target_price && quotedPrice
        ? Math.max(0, rfq.target_price - quotedPrice)
        : null;

      if (!this.opts.dryRun) {
        await this.persistPatterns(call.id, patterns);
        const updatedDialect = await this.updateDialectIfApplicable(inferredLocale, dialect, patterns);
        await this.awardIfExceptional(call, patterns, rfq?.id || null, quotedPrice, floorPrice);

        return {
          call_id: call.id,
          supplier_name: supplierName,
          status: "success",
          overall_score: patterns.overall_score,
          patterns_count:
            patterns.successful_rebuttals.length +
            patterns.successful_openers.length +
            patterns.concession_effectiveness.length +
            patterns.region_specific_wins.length +
            patterns.failed_approaches.length,
          savings,
          dialect_updated: updatedDialect,
        };
      }

      return {
        call_id: call.id,
        supplier_name: supplierName,
        status: "success",
        overall_score: patterns.overall_score,
        patterns_count: patterns.successful_rebuttals.length,
        savings,
      };
    } catch (err: any) {
      return {
        call_id: call.id,
        supplier_name: "Unknown",
        status: "failed",
        overall_score: 0,
        patterns_count: 0,
        savings: null,
        error: err.message || String(err),
      };
    }
  }

  private inferLocale(region: string | null, country: string | null): string | null {
    const regionMap: Record<string, string> = {
      "Midwest": "hi-IN",
      "Maharashtra": "hi-IN",
      "Shanghai": "zh-CN",
      "Dubai": "ar-AE",
      "Hamburg": "de-DE",
      "Tokyo": "ja-JP",
    };

    const countryMap: Record<string, string> = {
      "US": "en-US",
      "IN": "hi-IN",
      "CN": "zh-CN",
      "AE": "ar-AE",
      "DE": "de-DE",
      "JP": "ja-JP",
      "MX": "es-MX",
      "VN": "vi-VN",
      "HK": "zh-HK",
    };

    if (region && regionMap[region]) return regionMap[region];
    if (country && countryMap[country]) return countryMap[country];
    return null;
  }

  private async persistPatterns(callId: string, patterns: NegotiationPatterns): Promise<void> {
    const traceData = {
      trace_type: "negotiation_logic",
      provider: "claude",
      phase: "completed",
      input_data: {
        supplier_id: patterns.supplier_id,
        supplier_name: patterns.supplier_name,
        region: patterns.region,
        dialect_locale: patterns.dialect_locale,
      },
      output_data: {
        overall_score: patterns.overall_score,
        rebuttals_found: patterns.successful_rebuttals.length,
        openers_found: patterns.successful_openers.length,
        concessions_found: patterns.concession_effectiveness.length,
        region_wins_found: patterns.region_specific_wins.length,
        failures_found: patterns.failed_approaches.length,
        key_learnings: patterns.key_learnings,
      },
      tokens_used: null,
      latency_ms: null,
    };

    const { error } = await tables.reasoning_traces.insert(traceData);
    if (error) console.warn("[RLWorker] Failed to persist pattern trace:", error.message);
  }

  private async updateDialectIfApplicable(
    locale: string | null,
    dialect: DialectContext | null,
    patterns: NegotiationPatterns,
  ): Promise<boolean> {
    if (!locale || !dialect) return false;

    const hasSignal = patterns.successful_rebuttals.length > 0 ||
      patterns.successful_openers.length > 0 ||
      patterns.region_specific_wins.length > 0 ||
      patterns.failed_approaches.length > 0;

    if (!hasSignal) return false;
    if (patterns.overall_score < 30) return false;

    const approach = patterns.overall_score >= 60 ? "reinforce" : "correct";
    const existingPrompt = buildDialectSection(dialect);
    const updatedPrompt = updateDialectPrompt(existingPrompt, patterns, approach);

    const { data: existing } = await tables.dialect_configs
      .select("id")
      .eq("locale", locale)
      .limit(1);

    if (existing && (existing as Pick<DialectConfigRow, "id">[]).length > 0) {
      const existingRow = (existing as Pick<DialectConfigRow, "id">[])[0];
      const updatedSection = updatedPrompt.replace(existingPrompt, "").trim();

      const existingMeta = await tables.dialect_configs
        .select("prompt_template")
        .eq("id", existingRow.id)
        .single();
      const currentTemplate = existingMeta?.data
        ? ((existingMeta.data as unknown as { prompt_template: string }).prompt_template as string)
        : "";

      const newTemplate = currentTemplate
        ? currentTemplate + "\n\n" + updatedSection
        : updatedSection;

      const { error } = await tables.dialect_configs
        .update({ prompt_template: newTemplate, updated_at: new Date().toISOString() })
        .eq("id", existingRow.id);

      if (error) {
        console.warn("[RLWorker] Failed to update dialect config:", error.message);
        return false;
      }

      console.log(`[RLWorker] Updated dialect config for ${locale} (${approach})`);
      this.opts.dryRun || console.log(`   → Added ${patterns.successful_rebuttals.length} rebuttals, ${patterns.region_specific_wins.length} regional wins`);
      return true;
    }

    return false;
  }

  private async awardIfExceptional(
    call: CallRow,
    patterns: NegotiationPatterns,
    rfqId: string | null,
    quotedPrice: number | null,
    floorPrice: number | null,
  ): Promise<void> {
    if (!rfqId) return;
    if (patterns.overall_score < 75) return;
    if (quotedPrice == null) return;

    const rfq = await getRFQById(rfqId);
    if (!rfq || rfq.status === "awarded" || rfq.status === "closed" || rfq.status === "cancelled") return;

    const savings = floorPrice != null
      ? Math.max(0, floorPrice - quotedPrice)
      : rfq.target_price != null
        ? Math.max(0, rfq.target_price - quotedPrice)
        : 0;

    if (savings <= 0) return;

    const { error } = await tables.rfqs
      .update({ status: "awarded" as const, updated_at: new Date().toISOString() })
      .eq("id", rfqId);

    if (!error) {
      await tables.rfq_suppliers
        .update({
          status: "agreed" as const,
          notes: "Auto-awarded by RL pipeline — exceptional negotiation outcome (score: " + patterns.overall_score + ")",
          updated_at: new Date().toISOString(),
        })
        .eq("rfq_id", rfqId)
        .eq("supplier_id", call.supplier_id);

      console.log(`[RLWorker] Auto-awarded RFQ ${rfqId.slice(0, 8)} to supplier ${call.supplier_id.slice(0, 8)} — savings: $${savings}`);
    }
  }
}

function buildDialectSection(dialect: DialectContext): string {
  const lines: string[] = [];
  lines.push("=== CULTURAL & DIALECT CONTEXT ===");
  lines.push("Supplier Region: " + dialect.name + " (" + dialect.locale + ")");
  lines.push("Formality Level: " + dialect.formalityLevel);
  lines.push("");
  lines.push("Communication Style:");
  lines.push(dialect.communicationStyle);
  if (dialect.culturalNotes) { lines.push(""); lines.push("Cultural Notes:"); lines.push(dialect.culturalNotes); }
  lines.push(""); lines.push("Negotiation Approach for This Region:");
  dialect.negotiationTips.forEach((tip, i) => lines.push((i + 1) + ". " + tip));
  if (dialect.greetingPhrase) lines.push(""); lines.push('Suggested Opening: "' + dialect.greetingPhrase + '"');
  if (dialect.closingPhrase) lines.push('Suggested Closing: "' + dialect.closingPhrase + '"');
  return lines.join("\n");
}

if (require.main === module) {
  const worker = new RLWorker({ dryRun: process.argv.includes("--dry-run") });
  worker.runOnce().then((report) => {
    console.log("\n=== RL Pipeline Report ===");
    console.log("Calls processed:", report.calls_processed);
    console.log("Patterns extracted:", report.patterns_extracted);
    console.log("Dialects updated:", report.dialects_updated);
    console.log("Failures:", report.failures);
    console.log("Total savings: $" + report.total_savings.toLocaleString());
    console.log("Duration:", new Date(report.completed_at).getTime() - new Date(report.started_at).getTime(), "ms");
    process.exit(0);
  }).catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
