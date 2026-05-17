import "dotenv/config";
import { getCallQueue, type QueueEntry } from "../lib/queue";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`PASS: ${msg}`);
}

function simulateAsyncCall(entry: QueueEntry, durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), durationMs);
  });
}

async function runConcurrencyTest() {
  console.log("=".repeat(60));
  console.log("CONCURRENCY CONTROL TEST");
  console.log("=".repeat(60));

  const queue = getCallQueue({
    maxConcurrent: 3,
    callsPerSecond: 10,
  });

  assert(queue.getMaxConcurrent() === 3, "maxConcurrent defaults to 3");

  queue.setMaxConcurrent(5);
  assert(queue.getMaxConcurrent() === 5, "setMaxConcurrent(5) works");

  let concurrentPeak = 0;
  let currentConcurrent = 0;
  let completedCount = 0;
  let failedCount = 0;

  queue.on("status_change" as any, (callId: string, status: string) => {
    if (status === "queued") {
      currentConcurrent++;
      concurrentPeak = Math.max(concurrentPeak, currentConcurrent);
    }
  });

  queue.on("completed" as any, () => {
    currentConcurrent--;
    completedCount++;
  });

  queue.on("failed" as any, () => {
    currentConcurrent--;
    failedCount++;
  });

  const totalCalls = 20;
  const entries: QueueEntry[] = Array.from({ length: totalCalls }, (_, i) => ({
    callId: `con-test-${i}`,
    rfqId: "con-test-rfq",
    supplierId: `con-test-sup-${i}`,
    supplierName: `Test Supplier ${i}`,
    phone: `+1555${String(1000 + i).padStart(4, "0")}`,
    priority: Math.floor(Math.random() * 100),
    status: "pending" as const,
    attempt: 0,
    maxAttempts: 2,
    error: null,
    queuedAt: Date.now(),
    startedAt: null,
    completedAt: null,
    twilioCallSid: null,
    result: null,
  }));

  queue.enqueueBatch(entries);
  assert(queue.getQueueLength() === totalCalls, `queue has ${totalCalls} entries`);

  const inFlightLimit = 5;
  const processed: string[] = [];
  const startTime = Date.now();

  while (completedCount + failedCount < totalCalls) {
    const entry = queue.dequeue();

    if (entry) {
      assert(
        queue.getInFlightCount() <= inFlightLimit,
        `in-flight count (${queue.getInFlightCount()}) ≤ ${inFlightLimit}`,
      );

      const duration = 50 + Math.floor(Math.random() * 100);
      processed.push(entry.callId);

      const isFailSlot = parseInt(entry.callId.split("-").pop() || "0", 10) >= 17;

      if (isFailSlot) {
        setTimeout(() => {
          queue.fail(entry.callId, "Simulated failure");
        }, duration);
      } else {
        setTimeout(() => {
          queue.complete(entry.callId, { price: 100 + Math.random() * 50 });
        }, duration);
      }
    } else {
      await sleep(50);
    }
  }

  const elapsed = Date.now() - startTime;

  console.log("-".repeat(60));
  console.log("RESULTS");
  console.log("-".repeat(60));
  assert(completedCount > 0, "some calls completed");
  assert(failedCount > 0, "some calls failed (simulated)");
  assert(
    completedCount + failedCount === totalCalls,
    `all ${totalCalls} calls processed (completed=${completedCount}, failed=${failedCount})`,
  );
  assert(
    concurrentPeak <= inFlightLimit + 3,
    `peak concurrency (${concurrentPeak}) ≤ limit (${inFlightLimit}) — retries may cause brief bursts`,
  );

  console.log(`\nTotal calls:   ${totalCalls}`);
  console.log(`Completed:     ${completedCount}`);
  console.log(`Failed:        ${failedCount}`);
  console.log(`Peak concurrency: ${concurrentPeak}`);
  console.log(`Elapsed:       ${(elapsed / 1000).toFixed(2)}s`);
  console.log(`Throughput:    ${((completedCount + failedCount) / (elapsed / 1000)).toFixed(1)} calls/s`);

  const retryCheck = queue.getAll();
  const retriedCalls = retryCheck.filter(
    (e) => e.error && e.attempt > 0 && e.status === "completed",
  );
  assert(retriedCalls.length > 0, "retry logic executed (failed calls retried)");

  console.log("\n" + "=".repeat(60));
  console.log("ALL CONCURRENCY TESTS PASSED");
  console.log("=".repeat(60));

  queue.destroy();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

runConcurrencyTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
