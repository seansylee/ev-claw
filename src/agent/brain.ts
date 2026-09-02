import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "../config.js";

/**
 * M1: single-shot turn, no tools, no persisted memory. Each call is fully
 * independent of SDK session state — see plan.md for why ev-claw doesn't use
 * SDK session resume (multiple concurrent trigger types don't form one linear
 * conversation). Memory/context will be layered on in M2 via contextBuilder().
 */
export async function runTurn(prompt: string): Promise<string> {
  let finalText = "";

  for await (const message of query({
    prompt,
    options: {
      model: config.model,
      tools: [], // no built-in tools yet — safest starting point (see M1 in plan)
      maxTurns: 1,
    },
  })) {
    if (message.type === "result") {
      if (message.subtype === "success") {
        finalText = message.result;
      } else {
        finalText = `(agent error: ${message.subtype} — ${message.errors.join("; ")})`;
      }
    }
  }

  return finalText || "(no response)";
}
