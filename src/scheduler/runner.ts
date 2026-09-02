import { runTurn } from "../agent/brain.js";
import { notifyOwner } from "../discord/notify.js";
import { getRecentJobRuns, insertJobRun, type JobRunStatus } from "../db/repositories/jobRuns.js";
import type { ScheduledJobRow } from "../db/repositories/scheduledJobs.js";
import { runWatchdogCheck } from "./watchdog.js";
import { classifyWatchdogTransition } from "./watchdogAlert.js";

/** Runs one due job to completion and records its outcome in job_runs. */
export async function runDueJob(job: ScheduledJobRow): Promise<void> {
  const result = await dispatch(job);
  insertJobRun({ jobId: job.id, status: result.status, summary: result.summary });
}

async function dispatch(job: ScheduledJobRow): Promise<{ status: JobRunStatus; summary: string }> {
  switch (job.job_type) {
    case "watchdog": {
      const previous = getRecentJobRuns(job.id, 1)[0];
      const check = await runWatchdogCheck(job);

      // Cost control + no-spam: only call the LLM (and DM the owner) on an
      // actual state transition — a repeated ongoing failure (or a repeated
      // pass) never touches the model or sends another DM.
      const transition = classifyWatchdogTransition(previous?.status, check.status);
      if (transition === "became_failing") {
        const alert = await runTurn({
          type: "watchdog",
          content: `Watchdog "${job.name}" just started failing: ${check.summary}. Write a short, direct alert message for the user (a few sentences at most).`,
        });
        await notifyOwner(alert);
      } else if (transition === "recovered") {
        const alert = await runTurn({
          type: "watchdog",
          content: `Watchdog "${job.name}" has recovered: ${check.summary}. Write a short, friendly message letting the user know it's back to normal.`,
        });
        await notifyOwner(alert);
      }
      return check;
    }

    case "custom_prompt": {
      const payload = parsePayload<{ prompt?: string }>(job.payload_json);
      const prompt = payload.prompt ?? job.name;
      const reply = await runTurn({ type: "cron", content: prompt });
      await notifyOwner(reply);
      return { status: "success", summary: "custom_prompt executed" };
    }

    case "reminder": {
      const payload = parsePayload<{ message?: string }>(job.payload_json);
      await notifyOwner(payload.message ?? job.name);
      return { status: "success", summary: "reminder sent" };
    }

    case "task_runner":
      // Lands in M4 — the autonomous task backlog doesn't exist yet.
      return { status: "skipped", summary: "task_runner not implemented until M4" };

    default:
      // job_type comes from the DB at runtime, so guard against unexpected
      // values even though the TS type is exhaustive.
      return { status: "skipped", summary: `Unknown job_type: ${String((job as { job_type: unknown }).job_type)}` };
  }
}

function parsePayload<T>(payloadJson: string | null): T {
  if (!payloadJson) return {} as T;
  try {
    return JSON.parse(payloadJson) as T;
  } catch {
    return {} as T;
  }
}
