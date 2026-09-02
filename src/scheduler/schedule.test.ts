import { describe, expect, it } from "vitest";
import { computeNextRunAt } from "./schedule.js";
import type { ScheduledJobRow } from "../db/repositories/scheduledJobs.js";

function makeJob(overrides: Partial<ScheduledJobRow> = {}): ScheduledJobRow {
  return {
    id: 1,
    name: "test-job",
    schedule_type: "interval",
    schedule_expr: "60000",
    job_type: "watchdog",
    payload_json: null,
    enabled: 1,
    next_run_at: 0,
    last_run_at: null,
    created_at: 0,
    ...overrides,
  };
}

describe("computeNextRunAt", () => {
  it("adds the interval in ms to the 'from' time", () => {
    const job = makeJob({ schedule_expr: "60000" });
    expect(computeNextRunAt(job, 1_000_000)).toBe(1_060_000);
  });

  it("throws on a non-numeric interval expression", () => {
    const job = makeJob({ schedule_expr: "not-a-number" });
    expect(() => computeNextRunAt(job, 0)).toThrow();
  });

  it("throws on a zero or negative interval", () => {
    expect(() => computeNextRunAt(makeJob({ schedule_expr: "0" }), 0)).toThrow();
    expect(() => computeNextRunAt(makeJob({ schedule_expr: "-5" }), 0)).toThrow();
  });

  it("throws for schedule_type 'cron' (not implemented yet)", () => {
    const job = makeJob({ schedule_type: "cron", schedule_expr: "* * * * *" });
    expect(() => computeNextRunAt(job, 0)).toThrow(/implemented yet/i);
  });
});
