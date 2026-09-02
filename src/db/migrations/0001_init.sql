-- ev-claw initial schema. See PLAN.md "SQLite schema" for the design rationale.
-- All statements are idempotent (IF NOT EXISTS) so this can run on every boot.

-- Append-only conversation log. trigger_type records which subsystem produced
-- the turn (chat / cron / watchdog / task_step) so contextBuilder can weight
-- or filter by source later if needed.
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system_event')),
  content TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('chat', 'cron', 'watchdog', 'task_step')),
  discord_message_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts);

-- Autonomous task/goal backlog (built out in M4).
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'blocked', 'done', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  due_at INTEGER,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- Both cron and interval jobs, including watchdog checks (job_type='watchdog').
-- Built out in M3.
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('cron', 'interval')),
  schedule_expr TEXT NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('watchdog', 'reminder', 'task_runner', 'custom_prompt')),
  payload_json TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  next_run_at INTEGER NOT NULL,
  last_run_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at) WHERE enabled = 1;

-- Execution history per scheduled job; doubles as monitoring/watchdog history.
CREATE TABLE IF NOT EXISTS job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES scheduled_jobs(id),
  ts INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'alert', 'skipped')),
  summary TEXT
);
CREATE INDEX IF NOT EXISTS idx_job_runs_job_id ON job_runs(job_id);

-- Simple key/value preferences (e.g. "prefers short replies").
CREATE TABLE IF NOT EXISTS user_prefs (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Free-form facts the agent chose to remember via a save_memory_note tool.
CREATE TABLE IF NOT EXISTS memory_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  content TEXT NOT NULL
);

-- Persists in-flight canUseTool approvals so a crash/restart mid-approval
-- doesn't leave a dangling in-memory promise. Built out in M5.
CREATE TABLE IF NOT EXISTS pending_confirmations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  input_json TEXT NOT NULL,
  discord_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'expired')),
  resolved_at INTEGER
);
