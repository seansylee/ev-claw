import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Env vars must be set before config.ts (transitively imported by db/client.ts)
// evaluates, since it fail-fasts on missing required vars. Dynamic imports
// below ensure that ordering.
beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), "ev-claw-test-"));
  process.env.ANTHROPIC_API_KEY ??= "test-key";
  process.env.DISCORD_BOT_TOKEN ??= "test-token";
  process.env.OWNER_DISCORD_ID ??= "test-owner-id";
  process.env.DB_PATH = join(dir, "test.db");
});

describe("buildContext", () => {
  beforeEach(async () => {
    const { getDb } = await import("../db/client.js");
    getDb().exec("DELETE FROM messages");
  });

  it("has no 'Recent conversation' section when history is empty", async () => {
    const { buildContext } = await import("./contextBuilder.js");

    const text = buildContext({ type: "chat", content: "hello" });

    expect(text).not.toContain("Recent conversation");
    expect(text).toContain("[Trigger: chat]");
    expect(text).toContain("hello");
  });

  it("includes prior messages, in chronological order, ahead of the trigger", async () => {
    const { insertMessage } = await import("../db/repositories/messages.js");
    const { buildContext } = await import("./contextBuilder.js");

    insertMessage({ role: "user", content: "first", triggerType: "chat" });
    insertMessage({ role: "assistant", content: "second", triggerType: "chat" });

    const text = buildContext({ type: "chat", content: "third" });

    const firstIdx = text.indexOf("first");
    const secondIdx = text.indexOf("second");
    const triggerIdx = text.indexOf("[Trigger: chat]");

    expect(firstIdx).toBeGreaterThan(-1);
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(triggerIdx);
    expect(text).toContain("third");
  });

  it("caps history at the last 25 turns", async () => {
    const { insertMessage } = await import("../db/repositories/messages.js");
    const { buildContext } = await import("./contextBuilder.js");

    for (let i = 0; i < 30; i++) {
      insertMessage({ role: "user", content: `msg-${i}`, triggerType: "chat" });
    }

    const text = buildContext({ type: "chat", content: "latest" });

    expect(text).toContain("last 25 turns");
    expect(text).not.toContain("msg-0\n");
    expect(text).not.toContain("msg-4\n");
    expect(text).toContain("msg-5");
    expect(text).toContain("msg-29");
  });
});
