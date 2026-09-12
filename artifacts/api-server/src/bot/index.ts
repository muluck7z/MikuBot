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
import { errorContainer, infoContainer, v2Reply } from "./v2/index";
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

const AUTO_BAN_CHANNEL_ID = "1547640224107073586";
const WELCOME_CHANNEL_ID = "1547416800092750034";
const MESSAGE_LOG_CHANNEL_ID = "1547416310063955978";

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
    // Interações fora de servidor (DM) — cassino, aviator e empréstimos pessoais
    // funcionam em DM; todo o resto segue bloqueado.
    if (!interaction.inGuild()) {
      const id = "customId" in interaction ? (interaction as { customId: string }).customId : "";
      const isCassinoDM =
        (interaction.isChatInputCommand() && interaction.commandName === "cassino") ||
        ((interaction.isButton() || interaction.isModalSubmit()) &&
          (id.startsWith("cassino:") || id.startsWith("aviator:")));
      const isPempDM =
        (interaction.isButton() || interaction.isModalSubmit()) && id.startsWith("pemp:");

      if (isCassinoDM) {
        if (isEconomyBlocked(interaction.user.id)) {
          await replyEconomyBlocked(
            interaction as ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction
          );
          return;
        }
        if (interaction.isChatInputCommand()) {
          const command = commands.get("cassino");
          if (!command) return;
          try {
            await command.execute(interaction as ChatInputCommandInteraction);
          } catch (err) {
            logger.error({ err }, "Erro no comando /cassino (DM)");
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
          await handleButton(interaction as ButtonInteraction).catch((err) =>
            logger.error({ err }, "Erro no botão cassino/aviator (DM)")
          );
        } else if (interaction.isModalSubmit()) {
          await handleModal(interaction as ModalSubmitInteraction).catch((err) =>
            logger.error({ err }, "Erro no modal cassino/aviator (DM)")
          );
        }
        return;
      }

      if (isPempDM) {
        if (isEconomyBlocked(interaction.user.id)) {
          await replyEconomyBlocked(interaction);
          return;
        }
        if (interaction.isButton()) {
          await handlePeerLoanButton(interaction).catch((err) =>
            logger.error({ err }, "Erro no botão de empréstimo pessoal (DM)")
          );
        } else if (interaction.isModalSubmit()) {
          await handleModal(interaction as ModalSubmitInteraction).catch((err) =>
            logger.error({ err }, "Erro no modal de empréstimo pessoal (DM)")
          );
        }
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

    // Interações da loja e do inventário são públicas — cada membro só acessa
    // seus próprios itens e saldo pelo ID da interação.
    const isLojaInteraction = interaction.isButton() && interaction.customId.startsWith("loja:");
    const isInventarioInteraction =
      (interaction.isButton() || interaction.isStringSelectMenu()) &&
      interaction.customId.startsWith("inventario:");

    // Commands available to all members regardless of role
    const PUBLIC_COMMANDS = new Set(["morte", "futuro", "banco", "pix", "administrar-saldo", "bloquear-contas", "cassino", "negocios", "loja", "inventario"]);
    const isPublicCommand =
      interaction.isChatInputCommand() && PUBLIC_COMMANDS.has(interaction.commandName);

    // Comandos e interações do sistema de economia — um usuário bloqueado por
    // /bloquear-contas não pode usar nenhum deles, mesmo sendo público.
    const ECONOMY_COMMANDS = new Set(["banco", "pix", "cassino", "negocios", "loja", "inventario"]);
    const isEconomyCommand =
      interaction.isChatInputCommand() && ECONOMY_COMMANDS.has(interaction.commandName);

    if (
      (isEconomyCommand || isBancoInteraction || isCassinoInteraction || isLojaInteraction || isInventarioInteraction) &&
      isEconomyBlocked(interaction.user.id)
    ) {
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
      !isLojaInteraction &&
      !isInventarioInteraction &&
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

  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    // Canal de punição automática: qualquer mensagem de usuário real resulta
    // em banimento, desde que o Discord permita ao bot moderar esse membro.
    if (message.channel.id === AUTO_BAN_CHANNEL_ID) {
      if (message.author.id === message.guild.ownerId) {
        logger.warn(
          { userId: message.author.id, channelId: message.channel.id },
          "Não foi possível banir o dono do servidor no canal de banimento automático"
        );
        return;
      }

      try {
        const member = message.member ?? await message.guild.members.fetch(message.author.id);
        if (!member.bannable) {
          logger.warn(
            { userId: message.author.id, channelId: message.channel.id },
            "Membro não pode ser banido; verifique Ban Members e a hierarquia de cargos"
          );
          return;
        }
        // Bane primeiro e só apaga depois: assim uma falha de permissão não
        // faz a mensagem desaparecer sem que o usuário seja punido.
        await message.guild.bans.create(message.author.id, {
          reason: "Mensagem enviada em canal de banimento automático",
          deleteMessageSeconds: 0,
        });
        await message.delete().catch(() => null);
        logger.info(
          { userId: message.author.id, channelId: message.channel.id },
          "Usuário banido por enviar mensagem no canal de banimento automático"
        );
      } catch (err) {
        logger.error(
          { err, userId: message.author.id, channelId: message.channel.id },
          "Falha ao banir usuário no canal de banimento automático"
        );
      }
      return;
    }

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

  async function sendMessageLog(
    guildId: string | undefined,
    content: ReturnType<typeof v2Reply>
  ): Promise<void> {
    try {
      const channel = await client.channels.fetch(MESSAGE_LOG_CHANNEL_ID);
      if (!channel || channel.type !== ChannelType.GuildText) {
        logger.warn({ channelId: MESSAGE_LOG_CHANNEL_ID }, "Canal de logs não encontrado ou não é um canal de texto");
        return;
      }
      if (guildId && channel.guild.id !== guildId) {
        logger.warn({ channelId: MESSAGE_LOG_CHANNEL_ID, guildId }, "Canal de logs pertence a outro servidor");
        return;
      }
      await channel.send(content as any);
    } catch (err) {
      logger.error({ err, channelId: MESSAGE_LOG_CHANNEL_ID }, "Falha ao enviar log de mensagem");
    }
  }

  function limitLogText(value: string): string {
    const normalized = value.replace(/```/g, "'''" ).trim();
    if (!normalized) return "*(sem texto — talvez apenas anexo)*";
    return normalized.length > 1500 ? `${normalized.slice(0, 1500)}…` : normalized;
  }

  client.on("guildMemberAdd", (member) => {
    const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (welcomeChannel?.type === ChannelType.GuildText) {
      welcomeChannel.send({
        content: `Boas-vindas, <@${member.id}>! Seja muito bem-vindo(a) ao servidor.`,
        allowedMentions: { users: [member.id] },
      }).then((welcomeMessage) => {
        setTimeout(() => {
          welcomeMessage.delete().catch(() => null);
        }, 20_000);
      }).catch((err) =>
        logger.error({ err, memberId: member.id, channelId: WELCOME_CHANNEL_ID }, "Falha ao enviar boas-vindas")
      );
    }

    handleMemberAdd(member.guild, member.id).catch((err) =>
      logger.error({ err }, "guildMemberAdd invite tracking error")
    );
  });

  client.on("messageDelete", async (message) => {
    if (message.author?.bot) return;
    if (message.partial) {
      try { await message.fetch(); } catch { /* registra o que estiver disponível */ }
    }
    const author = message.author ? `<@${message.author.id}>` : "Autor desconhecido";
    const log = v2Reply([infoContainer({
      title: "<:escudo:1530802103612608715>  **Mensagem apagada**",
      description: [
        `> <:ticket_user:1530817417842921492> Autor: ${author}`,
        `> <:comunidade2:1531072981688914103> Canal: <#${message.channel.id}>`,
        `> <:em:1531074006978138292> Conteúdo: ${limitLogText(message.content ?? "")}`,
      ].join("\n"),
    })]);
    await sendMessageLog(
      message.guild?.id,
      log
    );
  });

  client.on("messageUpdate", async (oldMessage, newMessage) => {
    if (newMessage.author?.bot) return;
    if (oldMessage.partial) {
      try { await oldMessage.fetch(); } catch { /* usa o conteúdo disponível */ }
    }
    if (newMessage.partial) {
      try { await newMessage.fetch(); } catch { /* usa o conteúdo disponível */ }
    }
    if (oldMessage.content === newMessage.content) return;
    const author = newMessage.author ? `<@${newMessage.author.id}>` : "Autor desconhecido";
    const log = v2Reply([infoContainer({
      title: "<:escudo:1530802103612608715>  **Mensagem editada**",
      description: [
        `> <:ticket_user:1530817417842921492> Autor: ${author}`,
        `> <:comunidade2:1531072981688914103> Canal: <#${newMessage.channel.id}>`,
        `> <:clock:1508157710422507663> Conteúdo antigo: ${limitLogText(oldMessage.content ?? "")}`,
        `> <:em:1531074006978138292> Conteúdo atual: ${limitLogText(newMessage.content ?? "")}`,
      ].join("\n"),
    })]);
    await sendMessageLog(
      newMessage.guild?.id,
      log
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
