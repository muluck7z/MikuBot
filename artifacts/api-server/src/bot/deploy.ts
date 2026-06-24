import { REST, Routes } from "discord.js";
import { logger } from "../lib/logger";

function makeRest() {
  const token = process.env["DISCORD_BOT_TOKEN"];
  const clientId = process.env["DISCORD_CLIENT_ID"];
  if (!token || !clientId) return null;
  return { rest: new REST({ version: "10" }).setToken(token), clientId };
}

export async function deployCommands(commands: object[]) {
  const ctx = makeRest();
  if (!ctx) {
    logger.warn("Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID — skipping deploy");
    return;
  }

  try {
    logger.info({ count: commands.length }, "Deploying slash commands globally");
    await ctx.rest.put(Routes.applicationCommands(ctx.clientId), { body: commands });
    logger.info("Slash commands deployed successfully");
  } catch (err) {
    logger.error({ err }, "Failed to deploy slash commands");
    throw err;
  }
}

/**
 * Busca os nomes dos comandos atualmente registrados no Discord.
 * Retorna null se não for possível buscar (token/clientId ausentes ou erro de rede).
 */
export async function fetchRegisteredCommandNames(): Promise<string[] | null> {
  const ctx = makeRest();
  if (!ctx) return null;

  try {
    const registered = (await ctx.rest.get(
      Routes.applicationCommands(ctx.clientId)
    )) as Array<{ name: string }>;
    return registered.map((c) => c.name);
  } catch (err) {
    logger.warn({ err }, "Não foi possível buscar os comandos registrados");
    return null;
  }
}
