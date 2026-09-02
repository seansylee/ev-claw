import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name} (see .env.example)`);
  }
  return value;
}

export const config = {
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  discordBotToken: required("DISCORD_BOT_TOKEN"),
  ownerDiscordId: required("OWNER_DISCORD_ID"),
  dbPath: process.env.DB_PATH ?? "./data/ev-claw.db",
  workspaceDir: process.env.EV_CLAW_WORKSPACE_DIR ?? "~/ev-claw-workspace",
  model: process.env.EV_CLAW_MODEL ?? "claude-sonnet-5",
};
