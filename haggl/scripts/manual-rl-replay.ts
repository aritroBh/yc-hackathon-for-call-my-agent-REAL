#!/usr/bin/env node
/**
 * Manual RL pipeline replay script.
 *
 * Re-processes completed calls through the RL pipeline for testing,
 * debugging, or re-running after pattern extraction improvements.
 *
 * Usage:
 *   npx tsx scripts/manual-rl-replay.ts                          # last 24h
 *   npx tsx scripts/manual-rl-replay.ts --hours 72               # last 72h
 *   npx tsx scripts/manual-rl-replay.ts --call-id <uuid>         # single call
 *   npx tsx scripts/manual-rl-replay.ts --rfq-id <uuid>          # all calls for RFQ
 *   npx tsx scripts/manual-rl-replay.ts --dry-run                # don't persist
 *   npx tsx scripts/manual-rl-replay.ts --verbose                # full output
 *   npx tsx scripts/manual-rl-replay.ts --json                   # JSON report only
 */

import "dotenv/config";
import { tables } from "@/lib/db";
import { RLWorker } from "@/workers/rlWorker";
import type { CallRow } from "@/types/database";

interface ReplayOptions {
  hours: number;
  callId: string | null;
  rfqId: string | null;
  dryRun: boolean;
  verbose: boolean;
  json: boolean;
}

function parseArgs(): ReplayOptions {
  const args = process.argv.slice(2);
  const opts: ReplayOptions = {
    hours: 24,
    callId: null,
    rfqId: null,
    dryRun: false,
    verbose: false,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--hours":
        opts.hours = parseInt(args[++i], 10) || 24;
        break;
      case "--call-id":
        opts.callId = args[++i] || null;
        break;
      case "--rfq-id":
        opts.rfqId = args[++i] || null;
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--verbose":
        opts.verbose = true;
        break;
      case "--json":
        opts.json = true;
        break;
      case "--help":
      case "-h":
        console.log("Usage: npx tsx scripts/manual-rl-replay.ts [options]");
        console.log("  --hours N       Process last N hours (default: 24)");
        console.log("  --call-id <id>  Process a single call");
        console.log("  --rfq-id <id>   Process all completed calls for an RFQ");
        console.log("  --dry-run       Process without persisting results");
        console.log("  --verbose       Print per-call pattern details");
        console.log("  --json          Output JSON report only");
        process.exit(0);
    }
  }

  return opts;
}

async function main() {
  const opts = parseArgs();
  console.error("[Replay] Starting manual RL replay...");
  console.error(`[Replay] Options: ${JSON.stringify(opts, null, 2)}`);

  let targetCalls: CallRow[] = [];

  if (opts.callId) {
    const { data } = await tables.calls.select("*").eq("id", opts.callId).single();
    if (!data) {
      console.error("[Replay] Call not found:", opts.callId);
      process.exit(1);
    }
    targetCalls = [data as CallRow];
  } else if (opts.rfqId) {
    const { data } = await tables.calls
      .select("*")
      .eq("rfq_id", opts.rfqId)
      .in("status", ["completed"])
      .order("created_at", { ascending: false });
    targetCalls = (data as CallRow[]) || [];
  } else {
    const since = new Date(Date.now() - opts.hours * 3600_000).toISOString();
    const { data } = await tables.calls
      .select("*")
      .in("status", ["completed"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);
    targetCalls = (data as CallRow[]) || [];
  }

  console.error(`[Replay] Found ${targetCalls.length} completed call(s)`);

  if (targetCalls.length === 0) {
    console.error("[Replay] No calls to process");
    process.exit(0);
  }

  const worker = new RLWorker({
    batchSize: targetCalls.length,
    concurrency: 3,
    dryRun: opts.dryRun,
    sinceHoursAgo: opts.hours,
  });

  const report = await worker.runOnce();
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.error("\n=== RL Replay Report ===");
    console.error(`Calls processed: ${report.calls_processed}`);
    console.error(`Patterns extracted: ${report.patterns_extracted}`);
    console.error(`Dialects updated: ${report.dialects_updated}`);
    console.error(`Failures: ${report.failures}`);
    console.error(`Total savings: $${report.total_savings.toLocaleString()}`);
    console.error(`Duration: ${new Date(report.completed_at).getTime() - new Date(report.started_at).getTime()}ms`);
    console.error("");

    if (opts.verbose && report.per_call.length > 0) {
      console.error("=== Per-Call Results ===");
      for (const c of report.per_call) {
        console.error(`  ${c.status === "success" ? "✓" : "✗"} ${c.supplier_name.padEnd(20)} score=${c.overall_score} patterns=${c.patterns_count} savings=$${c.savings || 0}${c.dialect_updated ? " dialect=updated" : ""}${c.error ? " err=" + c.error : ""}`);
      }
    }
  }

  process.exit(report.failures > 0 && report.calls_processed === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
