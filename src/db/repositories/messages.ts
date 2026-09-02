import { getDb } from "../client.js";

export type MessageRole = "user" | "assistant" | "system_event";
export type TriggerType = "chat" | "cron" | "watchdog" | "task_step";

export interface MessageRow {
  id: number;
  ts: number;
  role: MessageRole;
  content: string;
  trigger_type: TriggerType;
  discord_message_id: string | null;
}

export function insertMessage(params: {
  role: MessageRole;
  content: string;
  triggerType: TriggerType;
  discordMessageId?: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO messages (ts, role, content, trigger_type, discord_message_id)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(Date.now(), params.role, params.content, params.triggerType, params.discordMessageId ?? null);
}

/** Returns the most recent `limit` messages, oldest first (chronological). */
export function getRecentMessages(limit = 25): MessageRow[] {
  const rows = getDb()
    .prepare(`SELECT * FROM messages ORDER BY ts DESC LIMIT ?`)
    .all(limit) as unknown as MessageRow[];
  return rows.reverse();
}
