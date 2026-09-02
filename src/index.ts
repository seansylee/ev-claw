import { config } from "./config.js";
import { getDb } from "./db/client.js";
import { createDiscordClient } from "./discord/client.js";
import { registerHandlers } from "./discord/handlers.js";
import { registerNotifyClient } from "./discord/notify.js";
import { startCronLoop } from "./scheduler/cron.js";

async function main() {
  console.log("[ev-claw] booting (M3: scheduler/cron + watchdog)...");

  // Open the DB and run migrations before touching Discord, so a broken
  // schema/migration fails fast instead of connecting and then erroring on
  // the first message.
  getDb();
  console.log(`[db] ready at ${config.dbPath}`);

  const client = createDiscordClient();
  registerHandlers(client);
  registerNotifyClient(client);

  await client.login(config.discordBotToken);

  startCronLoop();
  console.log("[scheduler] cron loop started");
}

main().catch((err) => {
  console.error("[ev-claw] fatal error during boot:", err);
  process.exit(1);
});
