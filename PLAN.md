# ev-claw — Personal Persistent AI Agent (Claude Agent SDK)

## Status

- [x] **M1 — Basic Discord echo + single-turn SDK reply.** Done and verified live: bot connects, DMs work, and (extended slightly beyond the original M1 scope) `@mentions` in a shared server channel also work. Committed in `985a100`.
- [x] **M2 — SQLite persistence + conversation memory.** Done and verified live: told the bot a fact, killed and restarted the process (fresh Node process, zero in-memory state), asked it to recall the fact — it answered correctly, sourced entirely from `contextBuilder()` reading SQLite. 3 unit tests cover `buildContext()` (empty history, chronological ordering, 25-turn cap).
- [x] **M3 — Scheduler/cron + watchdog.** Done and verified live: a 1-minute interval watchdog job pointed at an unreachable URL fired, logged a `job_runs` failure row, and DMed a real LLM-composed alert. Found and fixed a real bug during live testing: the first version alerted on *every* failed tick (48 duplicate DMs over ~95 min in one test run) — fixed by only alerting on a state transition (healthy→failing, failing→recovered), verified by re-running 3 consecutive failures and confirming exactly one alert. 11 new unit tests (`computeNextRunAt`, the two-lane queue's serialization/error-isolation/independence, and the transition-alert decision logic in isolation, deliberately not mocking the live LLM/Discord calls per the plan's testing philosophy).
- [ ] M4 — Autonomous task runner
- [ ] M5 — Safety/confirmation rails
- [ ] M6 — launchd background service

**Deviations from the plan below, discovered during implementation:**
- `better-sqlite3` failed to compile against this machine's Node version (v26.8.1 — no prebuilt binary, native build breaks against its updated V8 API). Switched to Node's built-in `node:sqlite` module instead (zero native compilation). This only affects the DB layer (M2+); the schema design is unchanged.
- Discord replies aren't DM-only as originally scoped — it also responds to `@mentions` in server text channels, per a later request. DMs still respond to everything; channel messages require an explicit mention so it doesn't reply to unrelated chatter.
- Watchdog alerting isn't "alert on every failure" as originally scoped — live testing surfaced that this spams the owner (48 duplicate DMs in ~95 minutes during one test). Fixed to alert only on a state transition (healthy→failing, failing→recovered); see `scheduler/watchdogAlert.ts`.
- `schedule_type: 'cron'` isn't implemented yet — only `'interval'` jobs work for now (`scheduler/schedule.ts` throws a clear error for `'cron'`). Real cron-string parsing (e.g. via the `cron-parser` package) is deferred until an actual need for it shows up, per YAGNI; M3's watchdog/prompt use cases only needed interval scheduling.
- No chat-driven way to create scheduled jobs yet (that's part of M4/M5's custom tools) — `scripts/add-job.ts` is a stopgap CLI for creating `scheduled_jobs` rows directly.

---

## Context

Sean wants a personal, always-on AI agent — the kind of thing he referred to as "OpenClaw" — that lives on his Mac, is reachable via chat, remembers things across restarts, and can both react to him and act on its own (scheduled checks, autonomous task progress, monitoring/alerts). His `ev-claw` GitHub repo (`github.com/seansylee/ev-claw`) started out empty (just a README) — this plan builds the project from scratch inside it.

Confirmed requirements from Sean:
- **Purpose**: combine personal assistant/chat, autonomous task/goal runner, scheduled automation, and monitoring/watchdog in one system.
- **Interface**: Discord (DMs, plus @mentions in a shared channel), single-user (Sean only).
- **Deployment**: Mac background service, survives terminal close, restarts on crash/login.
- **Runtime**: TypeScript/Node.js with `@anthropic-ai/claude-agent-sdk`.
- **Memory**: SQLite (single local `.db` file, via `node:sqlite`) — conversation history, preferences, task state, monitoring history.
- **Scheduling**: both an interval/cron-style loop and event-driven (Discord messages, future webhooks).

## Verified SDK facts (checked against current docs, not memory)

- Package: `@anthropic-ai/claude-agent-sdk`. Core call: `query({ prompt, options })`, an async generator; `prompt` can be a plain string for single-shot turns.
- Custom tools: `tool(name, description, zodSchema, handler)` + `createSdkMcpServer({ name, version, tools })` passed via `options.mcpServers`.
- `options.tools`/`allowedTools`/`disallowedTools` gate which tools exist/auto-run; `options.canUseTool` is an async callback that can stay pending indefinitely — this is the primitive for a Discord approve/deny gate. **Never use `permissionMode: "bypassPermissions"`** — it defeats `canUseTool` entirely.
- SDK session resume (JSONL under `~/.claude/projects/...`) is built for one linear conversation tied to a cwd. Since ev-claw has multiple concurrent trigger types (chat/cron/watchdog/task-step), **we deliberately skip SDK session resume** and do fresh single-shot `query()` calls per turn, reconstructing context manually from SQLite each time. This matches the "recency + explicit state, no embeddings" requirement directly.
- `ANTHROPIC_API_KEY` is read automatically from `process.env` (confirmed via installed package types — no need to pass it through `options.env`).
- The final assistant reply text is `message.result` on the stream message where `type === "result"` and `subtype === "success"`.

**To verify during implementation (not blocking, but check first):**
1. ~~How `query()` picks up `ANTHROPIC_API_KEY`~~ — confirmed, see above.
2. Whether the SDK needs a `claude` CLI binary on `$PATH` or is fully self-contained via `npm install` — matters because launchd's `$PATH` is minimal. (Docs say self-contained via a bundled per-platform binary; not yet re-verified under launchd specifically — do this in M6.)
3. Exact `hooks` (`PreToolUse`) shape if adding a hard-deny floor alongside `canUseTool` — needed in M5.
4. Pick an explicit `options.model` rather than relying on the default — done (`config.model`, defaults to `claude-sonnet-5`).

## Architecture

Single Node.js process, single SQLite file, one Discord bot connection. No microservices, no external queue/broker.

```
Discord layer (discord.js, DMs from OWNER_DISCORD_ID only)
        │                              Scheduler (60s tick over scheduled_jobs)
        ▼                                       │
┌─────────────── Two-lane FIFO queue ───────────┴──────────────┐
│  interactive lane (chat, serial)   background lane (cron/watchdog/task-step, serial) │
└───────────────────────────┬───────────────────────────────────┘
                             ▼
                 Agent/brain layer: buildContext() from SQLite
                 → query() one-shot call → canUseTool safety gate
                 → custom tools (task/memory/schedule/notify)
                             ▼
                 SQLite (node:sqlite, one file)
```

**Why two lanes, not one:** a `canUseTool` confirmation can stay pending for minutes waiting on a Discord button. One global lane would let a slow background approval freeze chat responsiveness. Two independent serial lanes bound the blast radius: background work never blocks chat, and each lane's own serialization prevents two jobs racing on the same DB rows or double-firing a tool.

**Cost control:** the scheduler tick itself is cheap local SQL ("which jobs are due"); it only enqueues a job when due, and simple watchdog checks (e.g. "is this URL up") run in plain code, only invoking the LLM when something is actually noteworthy.

## SQLite schema (`node:sqlite`, ~7 tables)

- `messages` — append-only conversation log (`role`, `content`, `trigger_type`, timestamps).
- `tasks` — autonomous backlog (`title`, `status: pending|in_progress|blocked|done|cancelled`, `notes` scratchpad).
- `scheduled_jobs` — both cron and interval jobs, `job_type: watchdog|reminder|task_runner|custom_prompt` (a watchdog is just a job type, no separate table).
- `job_runs` — execution history per job; doubles as monitoring/watchdog history (`status: success|failure|alert|skipped`).
- `user_prefs` — simple KV.
- `memory_notes` — free-form facts the agent chose to remember.
- `pending_confirmations` — persists in-flight `canUseTool` approvals to disk so a crash/restart mid-approval doesn't leave a dangling promise; on boot, expire stale pending rows.

## Memory → context feed

One `buildContext()` function runs before every `query()` call and assembles a flat text block: last ~25 conversation turns, active tasks, known preferences/facts, upcoming jobs and recent alerts, then the current trigger's content. This whole block is the `prompt` string — no system-prompt caching tricks needed since we're not using session resume. After the turn, persist the exchange to `messages`; task/schedule/note mutations happen as side effects of tool handlers writing to SQLite during the call.

## Tools & safety rails (the most important part of this design)

**Built-ins** (`options.tools`): `Read`/`Grep`/`Glob`/`WebSearch`/`WebFetch` auto-allow (read-only or no local side effects). `Write`/`Edit` auto-allow only inside a dedicated `~/ev-claw-workspace` scratch dir. `Bash` — small hardcoded read-only allowlist (`ls`, `cat`, `df`, `ps`, `date`, `whoami`) auto-runs; everything else requires confirmation. Add explicit `disallowedTools` hard-deny patterns for catastrophic commands (`rm -rf /*`, disk-erase commands) as a floor even a `canUseTool` bug can't bypass.

**Custom tools** (one in-process MCP server via `createSdkMcpServer`): task CRUD, memory notes, preferences, job scheduling (create/list auto-allow; `cancel_job` requires confirmation since silently losing a watchdog is a real mistake), and `discord_notify` for proactive DMs from background jobs.

**`canUseTool` confirmation gate**: for anything not auto-safe, insert a `pending_confirmations` row, send Discord Approve/Deny buttons (`discord.js` `ButtonBuilder` + `createMessageComponentCollector` filtered to `OWNER_DISCORD_ID`), await resolution with a 10-minute timeout, **default-deny on timeout**. This default-deny-on-timeout plus disk-persisted pending state plus the hard `disallowedTools` floor is the core safety design for an unattended agent with real capability.

## Discord setup (pointer-level)

Create an application + bot in the Discord Developer Portal, enable the Message Content privileged intent plus `Guilds`/`GuildMessages`/`DirectMessages` gateway intents. Bots need to share a server with the user to DM — simplest path is a private server with just Sean and the bot. Hardcode/env `OWNER_DISCORD_ID` and silently ignore any other sender — this is what makes it single-user with no separate auth system.

## Background service: launchd (recommended over pm2)

Native to macOS, no extra always-running supervisor to maintain, restarts on crash (`KeepAlive`) and login (`RunAtLoad`). Plist at `~/Library/LaunchAgents/com.seanlee.ev-claw.plist` pointing at the absolute `node` path (resolve via `which node` — launchd's `$PATH` is minimal) and `dist/index.js`, with `StandardOutPath`/`StandardErrorPath` under `~/Library/Logs/ev-claw/`. Secrets stay in `.env`, loaded via `dotenv` at app startup, not in the plist. Control via `launchctl bootstrap gui/$UID <plist>`, `launchctl kickstart`, `launchctl list | grep ev-claw`.

## Config/secrets

`.env` at repo root (gitignored): `ANTHROPIC_API_KEY`, `DISCORD_BOT_TOKEN`, `OWNER_DISCORD_ID`, `DB_PATH`, `EV_CLAW_WORKSPACE_DIR`, `EV_CLAW_MODEL`. Commit a `.env.example` with placeholders. `.gitignore`: `.env`, `*.db`, `dist/`, `node_modules/`, logs. Real keys must never be committed — if a secret is ever pasted into a chat/conversation rather than typed directly into `.env`, rotate it afterward.

## Project structure

```
ev-claw/
  package.json, tsconfig.json, tsconfig.build.json, .env.example, .gitignore, PLAN.md
  src/
    index.ts                  # boot: db, discord client + handlers + notify, cron loop
    config.ts                 # env loading + validation
    agent/
      brain.ts                 # runTurn(): buildContext() + query() + persist
      contextBuilder.ts
    db/
      client.ts, migrations/0001_init.sql
      repositories/{messages,scheduledJobs,jobRuns}.ts
    discord/
      client.ts, handlers.ts    # owner-only auth, DM + @mention routing, routed through interactiveLane
      notify.ts                 # notifyOwner() — proactive DMs from background jobs
    scheduler/
      queue.ts                  # two-lane FIFO worker (interactive / background)
      cron.ts                   # tick loop over scheduled_jobs
      schedule.ts                # computeNextRunAt() — interval only so far, see Deviations
      watchdog.ts                # pure watchdog checks (url_reachability)
      watchdogAlert.ts            # state-transition alert decision (no-spam logic)
      runner.ts                  # dispatches a due job by job_type
    # not yet built (see Status above):
    agent/permissions.ts       # canUseTool + auto-safe classification + hard deny rules
    agent/tools/{index,taskTools,memoryTools,scheduleTools,notifyTools}.ts
    discord/confirm.ts
    taskRunner/runner.ts
  scripts/
    add-job.ts                  # stopgap CLI for creating scheduled_jobs rows (until M4/M5's schedule_job tool)
    launchd/com.seanlee.ev-claw.plist.example
  data/                          # sqlite file (gitignored)
```

## Build order & verification

1. **Basic Discord echo + single-turn SDK reply** (no tools, no DB). Verify: DM "hello" gets a coherent reply; non-owner messages are silently ignored; restart is clean. ✅ **Done.**
2. **SQLite persistence + conversation memory**. Verify: restart mid-conversation, confirm it recalls prior turns from DB. Unit test `contextBuilder()` against seeded fake rows. ✅ **Done.**
3. **Scheduler/cron + one real watchdog** (e.g. URL reachability). Verify: a 1-minute test job fires, logs a `job_runs` row, DMs on simulated failure. Unit test due-job calculation with fake timers. ✅ **Done** (see Status above for the alert-dedup fix found during verification).
4. **Autonomous task runner** as its own scheduled job. Verify: add a task via chat, let the runner advance it, confirm status transitions; confirm the background lane prevents double-processing.
5. **Safety/confirmation rails**. Verify: trigger an out-of-allowlist Bash command, see Approve/Deny buttons; test approve, deny, and timeout-auto-deny paths; kill the process mid-pending-confirmation and confirm it's marked `expired` on restart.
6. **launchd background service**. Verify: reboot/re-login reconnects automatically; `kill -9` the process and confirm launchd relaunches within seconds; logs land correctly; `launchctl list` shows healthy status.

Use Vitest for the DB repository layer and pure scheduler/permission logic — cheap and deterministic. Skip automating the live Discord/LLM integration; verify those manually per milestone, optionally with a thin smoke test that mocks `query()` to exercise queue/DB wiring without real API calls.

## Critical files

- `src/agent/permissions.ts` — the `canUseTool` safety gate; the highest-stakes file given real, unattended capability.
- `src/agent/contextBuilder.ts` — defines what memory/state actually reaches the model each turn.
- `src/scheduler/queue.ts` — two-lane concurrency model preventing races/double tool calls.
- `src/db/migrations/0001_init.sql` — schema for tasks/jobs/messages/confirmations.
- `src/discord/confirm.ts` — Discord button approval flow tied to `canUseTool`.
- `scripts/launchd/com.seanlee.ev-claw.plist.example` — background service definition.
