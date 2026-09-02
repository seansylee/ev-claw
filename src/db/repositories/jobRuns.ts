import { getDb } from "../client.js";

export type JobRunStatus = "success" | "failure" | "alert" | "skipped";

export interface JobRunRow {
  id: number;
  job_id: number;
  ts: number;
  status: JobRunStatus;
  summary: string | null;
}

export function insertJobRun(params: { jobId: number; status: JobRunStatus; summary?: string }): void {
  getDb()
    .prepare(`INSERT INTO job_runs (job_id, ts, status, summary) VALUES (?, ?, ?, ?)`)
    .run(params.jobId, Date.now(), params.status, params.summary ?? null);
}

export function getRecentJobRuns(jobId: number, limit = 10): JobRunRow[] {
  return getDb()
    .prepare(`SELECT * FROM job_runs WHERE job_id = ? ORDER BY ts DESC LIMIT ?`)
    .all(jobId, limit) as unknown as JobRunRow[];
}
