import "dotenv/config";
import { getCallQueue } from "../lib/queue";
import { getDispatcher } from "../lib/dispatcher";
import { getCallWorker } from "../workers/callWorker";

interface StressTestConfig {
  totalSuppliers: number;
  maxConcurrent: number;
  callsPerSecond: number;
  maxRetries: number;
  simulateFailRate: number;
}

function generateMockSupplier(index: number) {
  const regions = [
    "North India",
    "South India",
    "China Mandarin",
    "China Cantonese",
    "Mexico",
    "Vietnam",
  ];
  const region = regions[index % regions.length];
  return {
    id: `mock-supplier-${index}`,
    name: `Test Supplier ${index}`,
    phone: `+1555${String(1000 + index).padStart(4, "0")}`,
    contact_name: `Contact ${index}`,
    email: `supplier${index}@test.com`,
    region,
    priority: Math.floor(Math.random() * 100),
  };
}

async function runStressTest(config: StressTestConfig) {
  console.log("=".repeat(60));
  console.log("HAGGL STRESS TEST");
  console.log("=".repeat(60));
  console.log(`Suppliers:     ${config.totalSuppliers}`);
  console.log(`Max Concurrent: ${config.maxConcurrent}`);
  console.log(`Calls/sec:      ${config.callsPerSecond}`);
  console.log(`Max Retries:    ${config.maxRetries}`);
  console.log(`Fail Rate:      ${(config.simulateFailRate * 100).toFixed(0)}%`);
  console.log("-".repeat(60));

  const queue = getCallQueue({
    maxConcurrent: config.maxConcurrent,
    callsPerSecond: config.callsPerSecond,
    persistDir: "./data",
  });

  const dispatcher = getDispatcher({
    maxConcurrent: config.maxConcurrent,
    maxRetries: config.maxRetries,
  });

  const worker = getCallWorker({
    pollIntervalMs: 200,
    callTimeoutSeconds: 10,
    retryBackoffMs: 1_000,
  });

  let enqueued = 0;
  let completed = 0;
  let failed = 0;
  let retried = 0;
  const startTime = Date.now();

  queue.on("enqueued", () => {
    enqueued++;
  });

  queue.on("completed", () => {
    completed++;
    printProgress(enqueued, completed, failed, retried, startTime);
  });

  queue.on("failed", () => {
    failed++;
    printProgress(enqueued, completed, failed, retried, startTime);
  });

  queue.on("retrying", () => {
    retried++;
  });

  queue.on("drained", () => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("\n" + "=".repeat(60));
    console.log("STRESS TEST COMPLETE");
    console.log("=".repeat(60));
    console.log(`Elapsed:       ${elapsed}s`);
    console.log(`Dispatched:    ${enqueued}`);
    console.log(`Completed:     ${completed}`);
    console.log(`Failed:        ${failed}`);
    console.log(`Retries:       ${retried}`);
    console.log(
      `Throughput:    ${(enqueued / (parseFloat(elapsed) || 1)).toFixed(1)} calls/s`,
    );

    const missed = config.totalSuppliers - completed - failed;
    if (missed > 0) {
      console.log(`Missed:        ${missed}`);
    }

    queue.destroy();
    worker.stop();
    process.exit(0);
  });

  worker.start();

  const mockRfqId = `stress-test-rfq-${Date.now()}`;
  const mockOrgId = `stress-test-org-${Date.now()}`;

  const entries = Array.from({ length: config.totalSuppliers }, (_, i) => {
    const sup = generateMockSupplier(i);
    return {
      callId: `stress-call-${i}-${Date.now()}`,
      rfqId: mockRfqId,
      supplierId: sup.id,
      supplierName: sup.name,
      phone: sup.phone,
      priority: sup.priority,
      status: "pending" as const,
      attempt: 0,
      maxAttempts: config.maxRetries + 1,
      error: null,
      queuedAt: Date.now(),
      startedAt: null,
      completedAt: null,
      twilioCallSid: null,
      result: null,
    };
  });

  const batchSize = Math.min(10, config.totalSuppliers);
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    queue.enqueueBatch(batch);
    await sleep(100);
  }

  const timeout = setTimeout(() => {
    console.log("\nSTRESS TEST TIMEOUT - force exit");
    queue.destroy();
    worker.stop();
    process.exit(1);
  }, 120_000);

  queue.on("drained", () => clearTimeout(timeout));
}

function printProgress(
  enqueued: number,
  completed: number,
  failed: number,
  retried: number,
  start: number,
) {
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const rate = ((completed + failed) / (parseFloat(elapsed) || 1)).toFixed(1);
  process.stdout.write(
    `\rEnqueued: ${enqueued}  Completed: ${completed}  Failed: ${failed}  Retries: ${retried}  Rate: ${rate}/s  Elapsed: ${elapsed}s`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const config: StressTestConfig = {
  totalSuppliers: parseInt(process.argv[2] || "50", 10),
  maxConcurrent: parseInt(process.argv[3] || "5", 10),
  callsPerSecond: parseFloat(process.argv[4] || "1"),
  maxRetries: parseInt(process.argv[5] || "2", 10),
  simulateFailRate: 0,
};

runStressTest(config).catch((err) => {
  console.error("Stress test failed:", err);
  process.exit(1);
});
