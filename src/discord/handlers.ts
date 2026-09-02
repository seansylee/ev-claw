import type { Client, Message } from "discord.js";
import { config } from "../config.js";
import { runTurn } from "../agent/brain.js";
import { chunkForDiscord } from "./client.js";

export function registerHandlers(client: Client): void {
  client.once("clientReady", (readyClient) => {
    console.log(`[discord] logged in as ${readyClient.user.tag}`);
  });

  client.on("messageCreate", (message: Message) => {
    void handleMessage(message);
  });

  client.on("error", (err) => {
    console.error("[discord] client error:", err);
  });
}

async function handleMessage(message: Message): Promise<void> {
  // Ignore anything from bots (including ourselves) and anyone but the owner.
  // This is the entire auth model for ev-claw: single hardcoded owner ID, no
  // separate auth system.
  if (message.author.bot) return;
  if (message.author.id !== config.ownerDiscordId) {
    console.warn(`[discord] ignored message from non-owner id=${message.author.id}`);
    return;
  }

  const isDM = message.channel.isDMBased();
  const botId = message.client.user?.id;
  const isMentioned = botId ? message.mentions.users.has(botId) : false;

  // DMs always respond. In a server channel, only respond when @mentioned —
  // otherwise it would reply to every message in that channel, not just ones
  // meant for it.
  if (!isDM && !isMentioned) return;

  // Strip the leading/trailing @mention text so it's not part of the prompt.
  const text = (botId ? message.content.replace(new RegExp(`<@!?${botId}>`, "g"), "") : message.content).trim();
  if (!text) return;

  try {
    if ("sendTyping" in message.channel) {
      await message.channel.sendTyping();
    }
    const reply = await runTurn(text);
    for (const chunk of chunkForDiscord(reply)) {
      await message.reply(chunk);
    }
  } catch (err) {
    console.error("[brain] error handling message:", err);
    await message.reply("Something went wrong processing that — check the logs.");
  }
}
