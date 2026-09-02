/**
 * Dev/admin helper to create a scheduled_jobs row until M4/M5 add a
 * chat-driven schedule_job tool.
 *
 * Usage:
 *   npx tsx scripts/add-job.ts <name> <interval> <intervalMs> <watchdog|reminder|custom_prompt|task_runner> [payloadJson]
 *
 * Examples:
 *   npx tsx scripts/add-job.ts "example-watchdog" interval 60000 watchdog \
 *     '{"checkType":"url_reachability","url":"https://example.com"}'
 *
 *   npx tsx scripts/add-job.ts "hourly-checkin" interval 3600000 custom_prompt \
 *     '{"prompt":"Give the user a one-line status check-in."}'
 */
import { getDb } from "../src/db/client.js";
import { createJob, listJobs } from "../src/db/repositories/scheduledJobs.js";

const [name, scheduleType, scheduleExpr, jobType, payloadJson] = process.argv.slice(2);

if (!name || !scheduleType || !scheduleExpr || !jobType) {
  console.error(
    "Usage: npx tsx scripts/add-job.ts <name> <interval|cron> <scheduleExpr> <watchdog|reminder|custom_prompt|task_runner> [payloadJson]"
  );
  process.exit(1);
}

if (scheduleType !== "interval" && scheduleType !== "cron") {
  console.error(`Invalid scheduleType: ${scheduleType} (must be "interval" or "cron")`);
  process.exit(1);
}

getDb(); // ensures migrations have run

const id = createJob({
  name,
  scheduleType,
  scheduleExpr,
  jobType: jobType as "watchdog" | "reminder" | "custom_prompt" | "task_runner",
  payloadJson: payloadJson ?? null,
});

console.log(`Created job #${id}: ${name}`);
console.log(listJobs());
