import type { JobRunStatus } from "../db/repositories/jobRuns.js";

export type WatchdogTransition = "became_failing" | "recovered" | null;

/**
 * Decides whether a watchdog status change is worth alerting on. Alerts only
 * fire on a state transition (healthy -> failing, or failing -> recovered),
 * never on repeated identical statuses — otherwise an ongoing outage would
 * DM the user on every single tick forever. See PLAN.md "Cost control".
 */
export function classifyWatchdogTransition(
  previousStatus: JobRunStatus | undefined,
  currentStatus: JobRunStatus
): WatchdogTransition {
  if (currentStatus === "failure" && previousStatus !== "failure") return "became_failing";
  if (currentStatus === "success" && previousStatus === "failure") return "recovered";
  return null;
}
