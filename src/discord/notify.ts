import type { Client } from "discord.js";
import { config } from "../config.js";
import { chunkForDiscord } from "./client.js";

let discordClient: Client | undefined;

/** Called once from index.ts after the Discord client logs in. */
export function registerNotifyClient(client: Client): void {
  discordClient = client;
}

/** Proactively DMs the owner — used by background jobs (watchdog alerts, scheduled prompts). */
export async function notifyOwner(text: string): Promise<void> {
  if (!discordClient) {
    throw new Error("notifyOwner called before registerNotifyClient — Discord client not ready");
  }
  const user = await discordClient.users.fetch(config.ownerDiscordId);
  for (const chunk of chunkForDiscord(text)) {
    await user.send(chunk);
  }
}
