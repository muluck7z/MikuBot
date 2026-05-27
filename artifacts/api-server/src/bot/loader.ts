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
import { deployCommands } from "./deploy";
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
];

export async function loadCommands(commands: Collection<string, BotCommand>) {
  for (const cmd of allCommands) {
    commands.set(cmd.data.name, cmd);
  }
  logger.info({ count: allCommands.length }, "Commands loaded");

  try {
    await deployCommands(allCommands.map((c) => c.data.toJSON()));
  } catch (err) {
    logger.error({ err }, "Failed to deploy commands");
  }
}
