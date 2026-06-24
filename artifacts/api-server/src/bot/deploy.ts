import { REST, Routes } from "discord.js";
import { logger } from "../lib/logger";

function makeRest() {
  const token = process.env["DISCORD_BOT_TOKEN"];
  const clientId = process.env["DISCORD_CLIENT_ID"];
  if (!token || !clientId) return null;
  return { rest: new REST({ version: "10" }).setToken(token), clientId };
}

/**
 * Busca todos os comandos atualmente registrados no Discord (objetos completos).
 * Retorna null em caso de erro.
 */
export async function fetchRegisteredCommands(): Promise<Array<{ name: string; [key: string]: unknown }> | null> {
  const ctx = makeRest();
  if (!ctx) return null;

  try {
    const registered = (await ctx.rest.get(
      Routes.applicationCommands(ctx.clientId)
    )) as Array<{ name: string; [key: string]: unknown }>;
    return registered;
  } catch (err) {
    logger.warn({ err }, "Não foi possível buscar os comandos registrados");
    return null;
  }
}

/**
 * Faz o deploy mesclando os comandos do MikuBot com os comandos externos já registrados
 * (ex: RestoreCord). Comandos externos são preservados — nunca deletados.
 *
 * @param ourCommands  Lista de comandos do MikuBot (toJSON())
 * @param ourNames     Set com os nomes dos nossos comandos (para filtrar os externos)
 */
export async function deployCommandsMerged(
  ourCommands: object[],
  ourNames: Set<string>
) {
  const ctx = makeRest();
  if (!ctx) {
    logger.warn("Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID — skipping deploy");
    return;
  }

  // Busca comandos atuais para preservar os externos (RestoreCord, etc.)
  const current = await fetchRegisteredCommands();
  const external = current
    ? current.filter((c) => !ourNames.has(c.name))
    : [];

  if (external.length > 0) {
    logger.info(
      { external: external.map((c) => c.name) },
      "Preservando comandos externos (RestoreCord e outros)"
    );
  }

  const merged = [...external, ...ourCommands];

  try {
    logger.info(
      { total: merged.length, ours: ourCommands.length, external: external.length },
      "Deploying comandos (MikuBot + externos)"
    );
    await ctx.rest.put(Routes.applicationCommands(ctx.clientId), { body: merged });
    logger.info("Deploy concluído com sucesso — todos os comandos registrados");
  } catch (err) {
    logger.error({ err }, "Falha no deploy de comandos");
    throw err;
  }
}
