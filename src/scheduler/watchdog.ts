import type { JobRunStatus } from "../db/repositories/jobRuns.js";
import type { ScheduledJobRow } from "../db/repositories/scheduledJobs.js";

export interface WatchdogResult {
  status: JobRunStatus;
  summary: string;
}

interface UrlReachabilityPayload {
  checkType: "url_reachability";
  url: string;
  timeoutMs?: number;
}

type WatchdogPayload = UrlReachabilityPayload;

/**
 * Runs a watchdog check in plain code — no LLM call here. Per PLAN.md's cost
 * control design, the LLM only gets invoked (by the caller, runner.ts) when
 * a check actually fails; routine passing checks never touch the model.
 */
export async function runWatchdogCheck(job: ScheduledJobRow): Promise<WatchdogResult> {
  let payload: WatchdogPayload;
  try {
    payload = JSON.parse(job.payload_json ?? "{}") as WatchdogPayload;
  } catch {
    return { status: "skipped", summary: `Invalid payload_json for job ${job.id}` };
  }

  if (payload.checkType === "url_reachability") {
    return checkUrlReachability(payload);
  }

  return { status: "skipped", summary: `Unsupported watchdog checkType: ${(payload as { checkType?: string }).checkType}` };
}

async function checkUrlReachability(payload: UrlReachabilityPayload): Promise<WatchdogResult> {
  const timeoutMs = payload.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(payload.url, { method: "GET", signal: controller.signal });
    if (res.ok) {
      return { status: "success", summary: `${payload.url} reachable (HTTP ${res.status})` };
    }
    return { status: "failure", summary: `${payload.url} returned HTTP ${res.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "failure", summary: `${payload.url} unreachable: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}
