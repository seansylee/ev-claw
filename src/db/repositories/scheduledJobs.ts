import { getDb } from "../client.js";

export type ScheduleType = "cron" | "interval";
export type JobType = "watchdog" | "reminder" | "task_runner" | "custom_prompt";

export interface ScheduledJobRow {
  id: number;
  name: string;
  schedule_type: ScheduleType;
  schedule_expr: string;
  job_type: JobType;
  payload_json: string | null;
  enabled: number; // sqlite has no boolean type — 0/1
  next_run_at: number;
  last_run_at: number | null;
  created_at: number;
}

export function createJob(params: {
  name: string;
  scheduleType: ScheduleType;
  scheduleExpr: string;
  jobType: JobType;
  payloadJson?: string | null;
  /** Defaults to "now" so a newly created job fires on the very next tick. */
  nextRunAt?: number;
}): number {
  const now = Date.now();
  const result = getDb()
    .prepare(
      `INSERT INTO scheduled_jobs (name, schedule_type, schedule_expr, job_type, payload_json, enabled, next_run_at, last_run_at, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, NULL, ?)`
    )
    .run(
      params.name,
      params.scheduleType,
      params.scheduleExpr,
      params.jobType,
      params.payloadJson ?? null,
      params.nextRunAt ?? now,
      now
    );
  return Number(result.lastInsertRowid);
}

/** Jobs that are enabled and due to run at or before `now`. */
export function getDueJobs(now: number): ScheduledJobRow[] {
  return getDb()
    .prepare(`SELECT * FROM scheduled_jobs WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at ASC`)
    .all(now) as unknown as ScheduledJobRow[];
}

export function listJobs(): ScheduledJobRow[] {
  return getDb().prepare(`SELECT * FROM scheduled_jobs ORDER BY id ASC`).all() as unknown as ScheduledJobRow[];
}

/**
 * Called immediately when a job is identified as due — before it actually
 * runs — so an overlapping tick can't enqueue the same job twice while it's
 * still queued/running in the background lane.
 */
export function updateNextRun(id: number, nextRunAt: number, lastRunAt: number): void {
  getDb()
    .prepare(`UPDATE scheduled_jobs SET next_run_at = ?, last_run_at = ? WHERE id = ?`)
    .run(nextRunAt, lastRunAt, id);
}

export function setEnabled(id: number, enabled: boolean): void {
  getDb().prepare(`UPDATE scheduled_jobs SET enabled = ? WHERE id = ?`).run(enabled ? 1 : 0, id);
}
