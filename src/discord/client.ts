import { Client, GatewayIntentBits, Partials } from "discord.js";

export function createDiscordClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
    // Partials.Channel is required to receive messageCreate events for DM
    // channels that weren't already cached (i.e. most DMs on a fresh boot).
    partials: [Partials.Channel, Partials.Message],
  });
}

const DISCORD_MESSAGE_LIMIT = 2000;

/** Splits a long reply into <=2000 char chunks on line boundaries where possible. */
export function chunkForDiscord(text: string): string[] {
  if (text.length <= DISCORD_MESSAGE_LIMIT) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= DISCORD_MESSAGE_LIMIT) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n", DISCORD_MESSAGE_LIMIT);
    if (splitAt <= 0) splitAt = DISCORD_MESSAGE_LIMIT;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, "");
  }
  return chunks;
}
