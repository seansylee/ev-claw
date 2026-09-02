import { config } from "./config.js";
import { createDiscordClient } from "./discord/client.js";
import { registerHandlers } from "./discord/handlers.js";

async function main() {
  console.log("[ev-claw] booting (M1: Discord + single-turn SDK reply, no DB/tools yet)...");

  const client = createDiscordClient();
  registerHandlers(client);

  await client.login(config.discordBotToken);
}

main().catch((err) => {
  console.error("[ev-claw] fatal error during boot:", err);
  process.exit(1);
});
