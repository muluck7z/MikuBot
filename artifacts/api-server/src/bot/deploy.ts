import { REST, Routes } from "discord.js";
import { logger } from "../lib/logger";

export async function deployCommands(commands: object[]) {
  const token = process.env["DISCORD_BOT_TOKEN"];
  const clientId = process.env["DISCORD_CLIENT_ID"];

  if (!token || !clientId) {
    logger.warn("Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID — skipping deploy");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(token);

  try {
    logger.info({ count: commands.length }, "Deploying slash commands globally");
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    logger.info("Slash commands deployed successfully");
  } catch (err) {
    logger.error({ err }, "Failed to deploy slash commands");
    throw err;
  }
}
