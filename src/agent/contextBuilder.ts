import { getRecentMessages, type TriggerType } from "../db/repositories/messages.js";

const RECENT_MESSAGE_LIMIT = 25;

export interface Trigger {
  type: TriggerType;
  content: string;
}

/**
 * Assembles the full prompt sent to query() for a turn: recent conversation
 * history, then the current trigger. This whole block becomes the `prompt`
 * string — ev-claw deliberately doesn't use SDK session resume (see PLAN.md),
 * so this function is the entire memory system.
 *
 * Future milestones append more sections here (active tasks in M4, upcoming
 * jobs/recent alerts in M3, preferences/notes) — see PLAN.md "Memory ->
 * context feed" for the target shape.
 */
export function buildContext(trigger: Trigger): string {
  const recent = getRecentMessages(RECENT_MESSAGE_LIMIT);
  const sections: string[] = [];

  if (recent.length > 0) {
    const lines = recent.map((m) => `[${m.role}] ${m.content}`);
    sections.push(`## Recent conversation (last ${recent.length} turns)\n${lines.join("\n")}`);
  }

  sections.push(`---\n[Trigger: ${trigger.type}]\n${trigger.content}`);

  return sections.join("\n\n");
}
