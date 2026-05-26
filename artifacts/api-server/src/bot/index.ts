import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type GuildMember,
  MessageFlags,
} from "discord.js";
import { logger } from "../lib/logger";
import { loadCommands } from "./loader";
import { handleButton } from "./handlers/button";
import { handleModal } from "./handlers/modal";
import { handleSelectMenu } from "./handlers/selectMenu";
import { hasStaffAccess } from "./guard";
import { errorContainer } from "./v2/index";

export interface BotCommand {
  data: { name: string; toJSON(): object };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

export const commands = new Collection<string, BotCommand>();

async function replyAccessDenied(
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction
) {
  const payload = {
    components: [errorContainer("Você não tem permissão para usar o bot.\nApenas **Moderadores**, **Gerentes** e **Administradores** podem utilizar os comandos.")],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload).catch(() => null);
  } else {
    await interaction.reply(payload).catch(() => null);
  }
}

export async function startBot() {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    logger.error("DISCORD_BOT_TOKEN is not set");
    return;
  }

  await loadCommands(commands);

  client.once("ready", (c) => {
    logger.info({ tag: c.user.tag }, "Bot is ready");
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.inGuild()) return;

    const member = interaction.member as GuildMember | null;

    // Ticket interactions are public — any member can open/interact with their ticket
    const isTicketInteraction =
      (interaction.isStringSelectMenu() || interaction.isButton() || interaction.isModalSubmit()) &&
      "customId" in interaction &&
      (interaction.customId.startsWith("ticket:") || interaction.customId.startsWith("ticket_"));

    // Commands available to all members regardless of role
    const isPublicCommand =
      interaction.isChatInputCommand() && interaction.commandName === "morte";

    if (!isPublicCommand && !isTicketInteraction && (!member || !hasStaffAccess(member))) {
      await replyAccessDenied(
        interaction as ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction
      );
      return;
    }

    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction as ChatInputCommandInteraction);
      } catch (err) {
        logger.error({ err, command: interaction.commandName }, "Command error");
        const payload = {
          components: [errorContainer("Ocorreu um erro ao executar este comando.")],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload).catch(() => null);
        } else {
          await interaction.reply(payload).catch(() => null);
        }
      }
    } else if (interaction.isButton()) {
      await handleButton(interaction as ButtonInteraction);
    } else if (interaction.isModalSubmit()) {
      await handleModal(interaction as ModalSubmitInteraction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction as StringSelectMenuInteraction);
    }
  });

  await client.login(token);
}

export { client };
