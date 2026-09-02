import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "../config.js";
import { buildContext, type Trigger } from "./contextBuilder.js";
import { insertMessage } from "../db/repositories/messages.js";

/**
 * Runs one full turn: persist the incoming trigger, build the context prompt
 * from recent conversation history (see contextBuilder.ts), call the SDK,
 * persist the reply, and return it.
 *
 * Each call is an independent, fresh query() — no SDK session resume (see
 * PLAN.md "Verified SDK facts" for why). Still no tools/DB-backed tasks yet;
 * those land in M3-M5.
 */
export async function runTurn(trigger: Trigger, opts: { discordMessageId?: string } = {}): Promise<string> {
  insertMessage({
    role: "user",
    content: trigger.content,
    triggerType: trigger.type,
    discordMessageId: opts.discordMessageId,
  });

  const prompt = buildContext(trigger);

  let finalText = "";
  for await (const message of query({
    prompt,
    options: {
      model: config.model,
      tools: [], // no built-in tools yet — see M1/M5 in PLAN.md
      maxTurns: 1,
    },
  })) {
    if (message.type === "result") {
      finalText =
        message.subtype === "success"
          ? message.result
          : `(agent error: ${message.subtype} — ${message.errors.join("; ")})`;
    }
  }

  const reply = finalText || "(no response)";

  insertMessage({
    role: "assistant",
    content: reply,
    triggerType: trigger.type,
  });

  return reply;
}
