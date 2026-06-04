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
  type MessageReaction,
  type PartialMessageReaction,
  type User,
  type PartialUser,
  MessageFlags,
} from "discord.js";
import { logger } from "../lib/logger";
import { loadCommands } from "./loader";
import { handleButton } from "./handlers/button";
import { handleModal } from "./handlers/modal";
import { handleSelectMenu } from "./handlers/selectMenu";
import { hasStaffAccess } from "./guard";
import { errorContainer } from "./v2/index";
import { reactionRoleStore, makeKey, emojiKeyFromReaction } from "./reactionRoleStore";
import { cargoSessions } from "./cargoSessionStore";
import { handleCargoCommand, handleCargoSession } from "./handlers/cargo";

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
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.Reaction],
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

    // Botão de participar no sorteio é público — qualquer membro pode clicar
    const isSorteioEntrar =
      interaction.isButton() &&
      interaction.customId.startsWith("sorteio:entrar:");

    // Commands available to all members regardless of role
    const PUBLIC_COMMANDS = new Set(["morte", "futuro"]);
    const isPublicCommand =
      interaction.isChatInputCommand() && PUBLIC_COMMANDS.has(interaction.commandName);

    if (!isPublicCommand && !isTicketInteraction && !isSorteioEntrar && (!member || !hasStaffAccess(member))) {
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

  // ── Comando de prefixo !cargo ─────────────────────────────────────────────────

  client.on("messageCreate", (message) => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();

    // Inicia novo fluxo
    if (content === "!cargo") {
      handleCargoCommand(message).catch((err) =>
        logger.error({ err }, "!cargo error")
      );
      return;
    }

    // Continua sessão existente (inclui !pronto e respostas passo a passo)
    const session = cargoSessions.get(message.author.id);
    if (session && session.guildId === message.guild.id) {
      handleCargoSession(message, session).catch((err) =>
        logger.error({ err }, "cargo session error")
      );
    }
  });

  // ── Cargos por reação ────────────────────────────────────────────────────────

  async function handleReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    action: "add" | "remove"
  ) {
    if (user.bot) return;

    // Resolve partial (mensagens antigas podem vir incompletas)
    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }

    const message = reaction.message;
    const guild = message.guild;
    if (!guild) return;

    const emojiKey = emojiKeyFromReaction(reaction.emoji);
    const key = makeKey(message.id, emojiKey);
    const entry = reactionRoleStore.get(key);
    if (!entry || entry.guildId !== guild.id) return;

    try {
      const member = await guild.members.fetch(user.id);
      const role = guild.roles.cache.get(entry.roleId);
      if (!role) return;

      if (action === "add") {
        await member.roles.add(role, "Cargo por reação");
        logger.info({ userId: user.id, roleId: role.id, emoji: emojiKey }, "Cargo adicionado por reação");
      } else {
        await member.roles.remove(role, "Reação removida");
        logger.info({ userId: user.id, roleId: role.id, emoji: emojiKey }, "Cargo removido por reação");
      }
    } catch (err) {
      logger.error({ err }, "Erro ao gerenciar cargo por reação");
    }
  }

  client.on("messageReactionAdd", (reaction, user) => {
    handleReaction(reaction, user, "add").catch((err) =>
      logger.error({ err }, "messageReactionAdd error")
    );
  });

  client.on("messageReactionRemove", (reaction, user) => {
    handleReaction(reaction, user, "remove").catch((err) =>
      logger.error({ err }, "messageReactionRemove error")
    );
  });

  await client.login(token);
}

export { client };
