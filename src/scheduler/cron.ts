import { getDueJobs, updateNextRun } from "../db/repositories/scheduledJobs.js";
import { backgroundLane } from "./queue.js";
import { runDueJob } from "./runner.js";
import { computeNextRunAt } from "./schedule.js";

const TICK_INTERVAL_MS = 30_000;

/** Starts the periodic tick loop. Cheap local SQL every tick; the LLM is
 * only ever invoked inside a due job's own handler (see runner.ts), never
 * by the tick itself — see PLAN.md "Cost control". */
export function startCronLoop(): void {
  tick(); // run once immediately on boot so a due job doesn't wait a full interval
  setInterval(tick, TICK_INTERVAL_MS);
}

function tick(): void {
  const now = Date.now();
  const due = getDueJobs(now);

  for (const job of due) {
    // Bump next_run_at immediately, before the job actually runs, so an
    // overlapping tick can't enqueue the same job twice while it's still
    // queued/running in the background lane.
    try {
      const nextRunAt = computeNextRunAt(job, now);
      updateNextRun(job.id, nextRunAt, now);
    } catch (err) {
      console.error(`[cron] failed to reschedule job ${job.id} (${job.name}):`, err);
      continue;
    }

    backgroundLane.enqueue(async () => {
      await runDueJob(job);
    });
  }
}
