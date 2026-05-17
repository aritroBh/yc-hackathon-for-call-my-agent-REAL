#!/usr/bin/env node
/**
 * Cron schedule configuration for the RL pipeline.
 *
 * Usage:
 *   node cron/schedule.js install   — install cron job
 *   node cron/schedule.js uninstall — remove cron job
 *   node cron/schedule.js run       — run RL pipeline immediately
 *
 * The cron job runs nightly at 02:00 AM and processes the last 24 hours
 * of completed calls with feedback, extracts patterns, and updates
 * dialect configs.
 */

const { execSync } = require("child_process");
const path = require("path");
const os = require("os");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const CRON_COMMAND = `cd ${PROJECT_ROOT} && npx tsx workers/rlWorker.ts >> ${PROJECT_ROOT}/logs/rl-worker.log 2>&1`;
const CRON_SCHEDULE = "0 2 * * *"; // daily at 2 AM
const CRON_LINE = `${CRON_SCHEDULE} ${CRON_COMMAND}`;
const COMMENT = "# HAGGL RL Pipeline";

function isWindows() {
  return os.platform() === "win32";
}

function install() {
  if (isWindows()) {
    console.log("=== Windows Task Scheduler Setup ===");
    console.log("Creating scheduled task: HAGGL-RL-Pipeline");
    console.log("Schedule: Daily at 2:00 AM");
    console.log("Command: npx tsx workers/rlWorker.ts");
    console.log("Working dir:", PROJECT_ROOT);
    console.log("");
    console.log("Run this in an Admin PowerShell to install:");
    console.log("");
    console.log(`$action = New-ScheduledTaskAction -Execute "npx" -Argument "tsx workers/rlWorker.ts" -WorkingDirectory "${PROJECT_ROOT.replace(/\\/g, "\\\\")}"`);
    console.log(`$trigger = New-ScheduledTaskTrigger -Daily -At 02:00AM`);
    console.log(`$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest`);
    console.log(`Register-ScheduledTask -TaskName "HAGGL-RL-Pipeline" -Action $action -Trigger $trigger -Principal $principal -Description "Nightly HAGGL RL feedback loop"`);
    console.log("");
    console.log("Or use schtasks.exe:");
    console.log("");
    console.log(`schtasks /create /tn "HAGGL-RL-Pipeline" /tr "npx tsx ${path.join(PROJECT_ROOT, "workers", "rlWorker.ts").replace(/\\/g, "\\\\")}" /sc daily /st 02:00 /ru SYSTEM /f`);
    return;
  }

  const crontab = execSync("crontab -l 2>/dev/null || true").toString();
  if (crontab.includes(CRON_LINE)) {
    console.log("RL pipeline cron job already installed");
    return;
  }

  const newCrontab = crontab.trim() + "\n" + COMMENT + "\n" + CRON_LINE + "\n";
  execSync(`echo "${newCrontab}" | crontab -`);
  console.log("Installed RL pipeline cron job (daily @ 2 AM)");
}

function uninstall() {
  if (isWindows()) {
    console.log("Run in Admin PowerShell:");
    console.log('Unregister-ScheduledTask -TaskName "HAGGL-RL-Pipeline" -Confirm:$false');
    return;
  }

  const crontab = execSync("crontab -l 2>/dev/null || true").toString();
  const lines = crontab.split("\n").filter(
    (l) => !l.includes(CRON_LINE) && !l.includes(COMMENT),
  );
  execSync(`echo "${lines.join("\n")}" | crontab -`);
  console.log("Removed RL pipeline cron job");
}

function runNow() {
  console.log("Running RL pipeline immediately...");
  const result = execSync(`npx tsx ${path.join(PROJECT_ROOT, "workers", "rlWorker.ts")}`, {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
  });
  process.exit(result.status || 0);
}

const cmd = process.argv[2];
if (cmd === "install") install();
else if (cmd === "uninstall") uninstall();
else if (cmd === "run") runNow();
else {
  console.log("Usage: node cron/schedule.js [install|uninstall|run]");
  console.log("");
  console.log("  install   — Install RL pipeline cron job (daily @ 2 AM)");
  console.log("  uninstall — Remove RL pipeline cron job");
  console.log("  run       — Run RL pipeline immediately");
  process.exit(1);
}
