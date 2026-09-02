import { config } from "./config.js";
import { getDb } from "./db/client.js";
import { createDiscordClient } from "./discord/client.js";
import { registerHandlers } from "./discord/handlers.js";

async function main() {
  console.log("[ev-claw] booting (M2: SQLite persistence + conversation memory)...");

  // Open the DB and run migrations before touching Discord, so a broken
  // schema/migration fails fast instead of connecting and then erroring on
  // the first message.
  getDb();
  console.log(`[db] ready at ${config.dbPath}`);

  const client = createDiscordClient();
  registerHandlers(client);

  await client.login(config.discordBotToken);
}

main().catch((err) => {
  console.error("[ev-claw] fatal error during boot:", err);
  process.exit(1);
});
