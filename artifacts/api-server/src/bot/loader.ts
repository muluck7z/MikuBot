import { Collection } from "discord.js";
import { type BotCommand } from "./index";
import { ticketCommand } from "./commands/ticket";
import { embedCommand } from "./commands/embed";
import { banCommand } from "./commands/ban";
import { unbanCommand } from "./commands/unban";
import { muteCommand } from "./commands/mute";
import { unmuteCommand } from "./commands/unmute";
import { lockCommand } from "./commands/lock";
import { unlockCommand } from "./commands/unlock";
import { roleCommand } from "./commands/role";
import { kickCommand } from "./commands/kick";
import { clearCommand } from "./commands/clear";
import { userInfoCommand } from "./commands/userinfo";
import { serverInfoCommand } from "./commands/serverinfo";
import { warnCommand } from "./commands/warn";
import { emojiCommand } from "./commands/emoji";
import { morteCommand } from "./commands/morte";
import { futuroCommand } from "./commands/futuro";
import { reactionRoleCommand } from "./commands/reactionrole";
import { sorteioCommand } from "./commands/sorteio";
import { restorecordSetupCommand } from "./commands/restorecord_setup";
import { deployCommandsMerged, fetchRegisteredCommands } from "./deploy";
import { logger } from "../lib/logger";

const allCommands: BotCommand[] = [
  ticketCommand,
  embedCommand,
  banCommand,
  unbanCommand,
  muteCommand,
  unmuteCommand,
  lockCommand,
  unlockCommand,
  roleCommand,
  kickCommand,
  clearCommand,
  userInfoCommand,
  serverInfoCommand,
  warnCommand,
  emojiCommand,
  morteCommand,
  futuroCommand,
  reactionRoleCommand,
  sorteioCommand,
  restorecordSetupCommand,
];

/** Nomes dos comandos que pertencem ao MikuBot. */
const ourNames = new Set(allCommands.map((c) => c.data.name));
const ourCommandsJson = () => allCommands.map((c) => c.data.toJSON());

let watcherInterval: NodeJS.Timeout | null = null;

/**
 * Vigia de comandos: verifica se os comandos do MikuBot ainda estão todos registrados.
 * Se o RestoreCord (ou outra fonte) tiver sobrescrito, re-deploya imediatamente
 * preservando os comandos externos.
 */
async function watchCommands() {
  const registered = await fetchRegisteredCommands();

  if (registered === null) {
    // Não conseguiu buscar — tenta de novo no próximo ciclo
    return;
  }

  const registeredNames = new Set(registered.map((c) => c.name));
  const missing = [...ourNames].filter((name) => !registeredNames.has(name));

  if (missing.length > 0) {
    logger.warn(
      { missing, registeredCount: registered.length },
      "Comandos do MikuBot estão faltando — re-deploying agora (preservando externos)..."
    );
    try {
      await deployCommandsMerged(ourCommandsJson(), ourNames);
    } catch (err) {
      logger.error({ err }, "Falha no re-deploy emergencial");
    }
  } else {
    const external = registered.filter((c) => !ourNames.has(c.name));
    logger.debug(
      { total: registered.length, ours: ourNames.size, external: external.map((c) => c.name) },
      "Vigia OK — todos os comandos presentes"
    );
  }
}

export async function loadCommands(commands: Collection<string, BotCommand>) {
  for (const cmd of allCommands) {
    commands.set(cmd.data.name, cmd);
  }
  logger.info({ count: allCommands.length }, "Commands loaded");

  // Deploy inicial ao iniciar — já preserva qualquer comando externo presente
  try {
    await deployCommandsMerged(ourCommandsJson(), ourNames);
  } catch (err) {
    logger.error({ err }, "Falha no deploy inicial");
  }

  // Vigia: verifica a cada 2 minutos se os nossos comandos ainda estão lá
  if (!watcherInterval) {
    logger.info("Iniciando vigia de comandos — verificação a cada 2 minutos");
    watcherInterval = setInterval(() => {
      watchCommands().catch((err) =>
        logger.error({ err }, "Erro inesperado no vigia de comandos")
      );
    }, 2 * 60 * 1000);
  }
}
