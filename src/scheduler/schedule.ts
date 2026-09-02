import type { ScheduledJobRow } from "../db/repositories/scheduledJobs.js";

/** Computes when a job should next run, given the time it was last identified as due. */
export function computeNextRunAt(job: ScheduledJobRow, from: number): number {
  if (job.schedule_type === "interval") {
    const intervalMs = Number(job.schedule_expr);
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new Error(`Invalid interval schedule_expr for job ${job.id}: ${job.schedule_expr}`);
    }
    return from + intervalMs;
  }

  // Real cron-string parsing isn't implemented yet — 'interval' jobs cover
  // M3's needs (watchdogs, periodic prompts). Add a cron parser (e.g. the
  // `cron-parser` package) here if/when actual cron syntax is needed.
  throw new Error(`schedule_type 'cron' isn't implemented yet (job ${job.id}). Use 'interval' for now.`);
}
