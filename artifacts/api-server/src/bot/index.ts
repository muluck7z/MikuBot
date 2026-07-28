import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  ChannelType,
  PermissionFlagsBits,
  type TextChannel,
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
import { handlePeerLoanButton } from "./handlers/peerLoan";
import { hasStaffAccess } from "./guard";
import { isEconomyBlocked } from "./economyStore";
import { errorContainer } from "./v2/index";
import { reactionRoleStore, makeKey, emojiKeyFromReaction } from "./reactionRoleStore";
import { cargoSessions } from "./cargoSessionStore";
import { handleCargoCommand, handleCargoSession } from "./handlers/cargo";
import { handleMidSession } from "./handlers/mid";
import { midSessions } from "./ticketStore";
import { cacheGuildInvites, handleMemberAdd } from "./inviteTracker";

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
    GatewayIntentBits.GuildInvites,
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

async function replyEconomyBlocked(
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction
) {
  const payload = {
    components: [errorContainer("Você foi bloqueado(a) de usar o sistema de economia do banco.")],
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

  client.once("ready", async (c) => {
    logger.info({ tag: c.user.tag }, "Bot is ready");

    for (const [, guild] of c.guilds.cache) {
      try {
        const me = guild.members.me;
        if (!me) continue;

        const channel = guild.channels.cache.find(
          (ch): ch is TextChannel =>
            ch.type === ChannelType.GuildText &&
            ch
              .permissionsFor(me)
              ?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.MentionEveryone]) === true
        );

        if (!channel) {
          logger.warn({ guild: guild.name }, "Nenhum canal disponível para enviar mensagem de online");
          continue;
        }

        await channel.send("🔄 Bot online! @everyone");
        logger.info({ guild: guild.name, channel: channel.name }, "Mensagem de online enviada");
      } catch (err) {
        logger.error({ err, guild: guild.name }, "Erro ao enviar mensagem de online");
      }

      // Cacheia invites do servidor para o rastreamento de economia
      await cacheGuildInvites(guild).catch((err) =>
        logger.error({ err, guild: guild.name }, "Erro ao cachear invites na inicialização")
      );
    }
  });

  client.on("interactionCreate", async (interaction) => {
    // Empréstimos entre usuários: os botões Aceitar/Recusar/Pagar chegam por
    // DM (fora de servidor) — tratados aqui antes do bloqueio "guild-only".
    if (!interaction.inGuild()) {
      if (interaction.isButton() && interaction.customId.startsWith("pemp:")) {
        if (isEconomyBlocked(interaction.user.id)) {
          await replyEconomyBlocked(interaction);
          return;
        }
        await handlePeerLoanButton(interaction).catch((err) =>
          logger.error({ err }, "Erro no botão de empréstimo pessoal (DM)")
        );
      } else if (interaction.isModalSubmit() && interaction.customId.startsWith("pemp:")) {
        if (isEconomyBlocked(interaction.user.id)) {
          await replyEconomyBlocked(interaction);
          return;
        }
        await handleModal(interaction as ModalSubmitInteraction).catch((err) =>
          logger.error({ err }, "Erro no modal de empréstimo pessoal (DM)")
        );
      }
      return;
    }

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

    // Interações do banco são públicas — qualquer membro pode usar seu próprio banco
    // (botões E o envio dos modais, como escolher o valor de um empréstimo/investimento)
    const isBancoInteraction =
      (interaction.isButton() || interaction.isModalSubmit()) &&
      interaction.customId.startsWith("banco:");

    // Interações do cassino também são públicas — qualquer membro pode jogar na sua própria
    // mesa (Roleta e Aviator são ambos individuais, um jogo por dono do cartão)
    const isCassinoInteraction =
      (interaction.isButton() || interaction.isModalSubmit()) &&
      (interaction.customId.startsWith("cassino:") || interaction.customId.startsWith("aviator:"));

    // Commands available to all members regardless of role
    const PUBLIC_COMMANDS = new Set(["morte", "futuro", "banco", "pix", "administrar-saldo", "bloquear-contas", "cassino", "negocios"]);
    const isPublicCommand =
      interaction.isChatInputCommand() && PUBLIC_COMMANDS.has(interaction.commandName);

    // Comandos e interações do sistema de economia — um usuário bloqueado por
    // /bloquear-contas não pode usar nenhum deles, mesmo sendo público.
    const ECONOMY_COMMANDS = new Set(["banco", "pix", "cassino", "negocios"]);
    const isEconomyCommand =
      interaction.isChatInputCommand() && ECONOMY_COMMANDS.has(interaction.commandName);

    if ((isEconomyCommand || isBancoInteraction || isCassinoInteraction) && isEconomyBlocked(interaction.user.id)) {
      await replyEconomyBlocked(
        interaction as ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction
      );
      return;
    }

    if (
      !isPublicCommand &&
      !isTicketInteraction &&
      !isSorteioEntrar &&
      !isBancoInteraction &&
      !isCassinoInteraction &&
      (!member || !hasStaffAccess(member))
    ) {
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
      return;
    }

    // Sessão de MID (parceiro de troca)
    const midSession = midSessions.get(message.channel.id);
    if (midSession && midSession.guildId === message.guild.id) {
      handleMidSession(message, midSession).catch((err) =>
        logger.error({ err }, "mid session error")
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

  // ── Rastreamento de invites (economia) ───────────────────────────────────────

  client.on("guildMemberAdd", (member) => {
    handleMemberAdd(member.guild, member.id).catch((err) =>
      logger.error({ err }, "guildMemberAdd invite tracking error")
    );
  });

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
