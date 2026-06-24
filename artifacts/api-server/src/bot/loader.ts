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
import { deployCommands, fetchRegisteredCommandNames } from "./deploy";
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

/** Nomes dos comandos que o MikuBot deve sempre manter registrados. */
const expectedNames = new Set(allCommands.map((c) => c.data.name));

let watcherInterval: NodeJS.Timeout | null = null;

/**
 * Verifica se todos os comandos do MikuBot ainda estão registrados no Discord.
 * Se o RestoreCord ou outra fonte tiver sobrescrito os comandos, re-deploya imediatamente.
 */
async function watchCommands() {
  const registered = await fetchRegisteredCommandNames();

  if (registered === null) {
    // Não conseguiu buscar — tenta de novo no próximo ciclo
    return;
  }

  const registeredSet = new Set(registered);
  const missing = [...expectedNames].filter((name) => !registeredSet.has(name));

  if (missing.length > 0) {
    logger.warn(
      { missing, registeredCount: registered.length },
      "Comandos do MikuBot estão faltando — o RestoreCord pode ter sobrescrito. Re-deploying agora..."
    );
    try {
      await deployCommands(allCommands.map((c) => c.data.toJSON()));
      logger.info("Re-deploy emergencial concluído com sucesso.");
    } catch (err) {
      logger.error({ err }, "Falha no re-deploy emergencial");
    }
  } else {
    logger.debug(
      { total: registered.length, ours: expectedNames.size },
      "Comandos OK — nenhuma ação necessária"
    );
  }
}

export async function loadCommands(commands: Collection<string, BotCommand>) {
  for (const cmd of allCommands) {
    commands.set(cmd.data.name, cmd);
  }
  logger.info({ count: allCommands.length }, "Commands loaded");

  // Deploy inicial ao iniciar
  try {
    await deployCommands(allCommands.map((c) => c.data.toJSON()));
  } catch (err) {
    logger.error({ err }, "Failed to deploy commands on startup");
  }

  // Vigia de comandos: verifica a cada 2 minutos se os comandos ainda estão registrados.
  // Se o RestoreCord sobrescrever, detectamos em até 2 minutos e re-registramos imediatamente.
  if (!watcherInterval) {
    const CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2 minutos
    logger.info(
      { intervalMinutes: 2 },
      "Iniciando vigia de comandos — verificação a cada 2 minutos"
    );
    watcherInterval = setInterval(() => {
      watchCommands().catch((err) =>
        logger.error({ err }, "Erro inesperado no vigia de comandos")
      );
    }, CHECK_INTERVAL_MS);
  }
}
