import {
  type ButtonInteraction,
  type Message,
  type TextChannel,
  ButtonBuilder,
  ButtonStyle,
  Collection,
  PermissionFlagsBits,
  MessageFlags,
  Routes,
} from "discord.js";
import {
  infoContainer,
  successContainer,
  errorContainer,
  dangerButton,
  secondaryButton,
  row,
  v2Reply,
  v2EphemeralReply,
} from "../v2/index";
import { logger } from "../../lib/logger";
import { ticketStore } from "../ticketStore";
import { sorteioStore, sorteioByChannel } from "../sorteioStore";
import { buildSorteioComponents } from "../commands/sorteio";

const TICKET_EMOJI = "<:ticket:1508274275730063360>";
const RATING_CHANNEL_ID = "1497778916859973783";
const LOG_CHANNEL_ID    = "1497810672300593232";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchAllMessages(channel: TextChannel): Promise<Message[]> {
  const all: Message[] = [];
  let before: string | undefined;

  while (true) {
    const batch: Collection<string, Message> = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    });
    if (batch.size === 0) break;
    all.push(...batch.values());
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }

  return all;
}

function starLabel(stars: number): string {
  return "★".repeat(stars) + "☆".repeat(3 - stars);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0)   return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

async function sendTicketLog(options: {
  guild: ButtonInteraction["guild"] & object;
  channel: TextChannel;
  openerId: string | undefined;
  claimerId: string | undefined;
  closedById: string;
  closedByTag: string;
  reason: "moderador" | "usuario";
}) {
  const { guild, channel, openerId, claimerId, closedById, closedByTag, reason } = options;

  const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID) as TextChannel | undefined;
  if (!logChannel) {
    logger.warn({ channelId: LOG_CHANNEL_ID }, "Log channel not found");
    return;
  }

  const meta        = openerId ? ticketStore.get(channel.id) : undefined;
  const typeLabel   = meta?.typeLabel ?? "Desconhecido";
  const openedAt    = channel.createdAt;
  const durationMs  = Date.now() - openedAt.getTime();
  const openedTs    = Math.floor(openedAt.getTime() / 1000);

  // Fetch and count messages
  let openerMsgs  = 0;
  let claimerMsgs = 0;
  let totalMsgs   = 0;

  try {
    const messages = await fetchAllMessages(channel);
    totalMsgs   = messages.filter((m) => !m.author.bot).length;
    openerMsgs  = openerId  ? messages.filter((m) => m.author.id === openerId  && !m.author.bot).length : 0;
    claimerMsgs = claimerId ? messages.filter((m) => m.author.id === claimerId && !m.author.bot).length : 0;
  } catch (err) {
    logger.error({ err }, "Failed to fetch messages for ticket log");
  }

  const rating = meta?.rating;
  const ratingLine = rating !== undefined
    ? `${starLabel(rating)} (${rating}/3)`
    : "Não avaliado";

  const lines: string[] = [
    `**Canal:** \`${channel.name}\``,
    `**Tipo:** ${typeLabel}`,
    `**Aberto em:** <t:${openedTs}:F>`,
    `**Duração:** ${formatDuration(durationMs)}`,
    "",
    `**Solicitante:** ${openerId  ? `<@${openerId}>`  : "Desconhecido"}`,
    `**Responsável:** ${claimerId ? `<@${claimerId}>` : "Não assumido"}`,
    `**Fechado por:** <@${closedById}>`,
    "",
    `**Msgs do solicitante:** ${openerMsgs}`,
    `**Msgs do responsável:** ${claimerMsgs}`,
    `**Total de mensagens:** ${totalMsgs}`,
    "",
    `**Avaliação:** ${ratingLine}`,
  ];

  const emoji = reason === "usuario" ? "🚪" : "🔒";
  const title = reason === "usuario"
    ? `${emoji} Ticket Cancelado pelo Usuário`
    : `${emoji} Ticket Encerrado`;

  await logChannel.send({
    ...v2Reply([
      infoContainer({ title, description: lines.join("\n") }),
    ]),
  });

  ticketStore.delete(channel.id);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const [ns, action] = parts;

  try {
    if (ns === "ticket") {
      await handleTicketButton(interaction, action!, parts);
    } else if (ns === "sorteio") {
      await handleSorteioButton(interaction, action!, parts);
    } else {
      logger.warn({ customId: interaction.customId }, "Unknown button interaction");
    }
  } catch (err) {
    logger.error({ err, customId: interaction.customId }, "Button handler error");
    const fallback = v2EphemeralReply([errorContainer("Erro ao processar esta ação.")]);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(fallback).catch(() => null);
    } else {
      await interaction.reply(fallback).catch(() => null);
    }
  }
}

async function handleTicketButton(
  interaction: ButtonInteraction,
  action: string,
  parts: string[]
) {
  const guild = interaction.guild;
  if (!guild) return;

  if (action === "confirm_close") {
    const channel = interaction.channel as TextChannel;
    if (!channel.name.startsWith("ticket-")) {
      await interaction.reply(v2EphemeralReply([errorContainer("Este canal não é um ticket.")]));
      return;
    }

    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("Apenas moderadores podem fechar tickets.")])
      );
      return;
    }

    const closeTime = Math.floor((Date.now() + 30_000) / 1000);

    await interaction.reply(
      v2Reply([
        infoContainer({
          title: `${TICKET_EMOJI} Encerrando Ticket...`,
          description: [
            `Este ticket será encerrado <t:${closeTime}:R>.`,
            "",
            "Obrigado por entrar em contato com nossa equipe!",
          ].join("\n"),
        }),
      ])
    );

    // Parse opener/claimer from channel topic (format: "openerId" or "openerId:claimerId")
    const topic = channel.topic ?? "";
    const [openerId, claimerId] = topic.split(":");

    if (openerId && claimerId) {
      const STAR = { name: "estrela", id: "1508926292513521837", animated: true };
      const btn1 = new ButtonBuilder().setCustomId(`ticket:rate:1:${claimerId}:${openerId}`).setLabel("1").setEmoji(STAR).setStyle(ButtonStyle.Secondary);
      const btn2 = new ButtonBuilder().setCustomId(`ticket:rate:2:${claimerId}:${openerId}`).setLabel("2").setEmoji(STAR).setStyle(ButtonStyle.Secondary);
      const btn3 = new ButtonBuilder().setCustomId(`ticket:rate:3:${claimerId}:${openerId}`).setLabel("3").setEmoji(STAR).setStyle(ButtonStyle.Secondary);

      await channel.send({
        content: `<@${openerId}>`,
        allowedMentions: { users: [openerId] },
      });

      await channel.send({
        ...v2Reply(
          [
            infoContainer({
              title: "Avaliação de Atendimento",
              description: `Qual nota você daria para o atendimento de <@${claimerId}>?`,
            }),
          ],
          { buttons: [row(btn1, btn2, btn3)] }
        ),
      });
    }

    const closedById  = interaction.user.id;
    const closedByTag = interaction.user.tag;

    setTimeout(async () => {
      await sendTicketLog({
        guild,
        channel,
        openerId:    openerId  || undefined,
        claimerId:   claimerId || undefined,
        closedById,
        closedByTag,
        reason: "moderador",
      }).catch((err) => logger.error({ err }, "Failed to send ticket log"));

      await channel.delete("Ticket fechado por moderador").catch(() => null);
    }, 30_000);

  } else if (action === "cancel_close") {
    await interaction.reply(
      v2EphemeralReply([successContainer("Cancelado", "O fechamento do ticket foi cancelado.")])
    );

  } else if (action === "cancel_user") {
    const channel = interaction.channel as TextChannel;
    if (!channel.name.startsWith("ticket-")) {
      await interaction.reply(v2EphemeralReply([errorContainer("Este canal não é um ticket.")]));
      return;
    }

    const btnConfirm = dangerButton("ticket:confirm_cancel_user", "Sim, cancelar");
    const btnBack    = secondaryButton("ticket:cancel_close", "Voltar");

    await interaction.reply(
      v2Reply(
        [
          infoContainer({
            title: "Cancelar Ticket",
            description:
              "Tem certeza que deseja cancelar este ticket?\nO canal será removido e nenhum moderador terá sido notificado.",
          }),
        ],
        { buttons: [row(btnConfirm, btnBack)], ephemeral: true }
      )
    );

  } else if (action === "confirm_cancel_user") {
    const channel = interaction.channel as TextChannel;
    if (!channel.name.startsWith("ticket-")) {
      await interaction.reply(v2EphemeralReply([errorContainer("Este canal não é um ticket.")]));
      return;
    }

    await interaction.reply(
      v2Reply([
        infoContainer({
          title: "Ticket Cancelado",
          description: "Este ticket foi cancelado pelo usuário. O canal será removido em **5 segundos**.",
        }),
      ])
    );

    const topic = channel.topic ?? "";
    const [openerId, claimerId] = topic.split(":");
    const closedById  = interaction.user.id;
    const closedByTag = interaction.user.tag;

    setTimeout(async () => {
      await sendTicketLog({
        guild,
        channel,
        openerId:  openerId  || undefined,
        claimerId: claimerId || undefined,
        closedById,
        closedByTag,
        reason: "usuario",
      }).catch((err) => logger.error({ err }, "Failed to send ticket log"));

      await channel.delete("Ticket cancelado pelo usuário").catch(() => null);
    }, 5_000);

  } else if (action === "claim") {
    const channel = interaction.channel as TextChannel;
    if (!channel.name.startsWith("ticket-")) {
      await interaction.reply(v2EphemeralReply([errorContainer("Este canal não é um ticket.")]));
      return;
    }

    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("Apenas moderadores podem assumir tickets.")])
      );
      return;
    }

    await channel.permissionOverwrites.edit(interaction.user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      ManageMessages: true,
    });

    // Update topic to "openerId:claimerId" so we can use it for rating/log later
    const openerId = channel.topic ?? "";
    if (openerId && !openerId.includes(":")) {
      await channel.setTopic(`${openerId}:${interaction.user.id}`).catch(() => null);
    }

    await interaction.reply(
      v2Reply([
        infoContainer({
          title: "Ticket Assumido",
          description: `${interaction.user} é o responsável por este atendimento.\n\nPor favor, aguarde enquanto nossa equipe analisa sua solicitação.`,
          avatarUrl: interaction.user.displayAvatarURL({ size: 256 }),
        }),
      ])
    );

    logger.info({ moderator: interaction.user.tag, channel: channel.name }, "Ticket claimed");

  } else if (action === "rate") {
    // parts: ["ticket", "rate", stars, claimerId, openerId]
    const [, , starsStr, claimerId, openerId] = parts;
    const stars = parseInt(starsStr ?? "0", 10);

    if (!claimerId || !openerId || isNaN(stars)) {
      await interaction.reply(v2EphemeralReply([errorContainer("Dados de avaliação inválidos.")]));
      return;
    }

    // Only the ticket opener can rate
    if (interaction.user.id !== openerId) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("Apenas quem abriu o ticket pode avaliar o atendimento.")])
      );
      return;
    }

    const channel = interaction.channel as TextChannel;

    // Store rating in ticketStore so the log can pick it up
    const meta = ticketStore.get(channel.id);
    if (meta) {
      ticketStore.set(channel.id, { ...meta, rating: stars });
    }

    // Send rating to the rating channel
    const ratingChannel = guild.channels.cache.get(RATING_CHANNEL_ID) as TextChannel | undefined;
    if (ratingChannel) {
      await ratingChannel.send({
        ...v2Reply([
          infoContainer({
            title: "Nova Avaliação de Atendimento",
            description: [
              `**Atendente:** <@${claimerId}>`,
              `**Avaliado por:** <@${openerId}>`,
              `**Nota:** ${starLabel(stars)} (${stars}/3)`,
            ].join("\n"),
          }),
        ]),
      });
    }

    // Acknowledge and disable further ratings
    await interaction.update({
      ...v2Reply([
        infoContainer({
          title: "Avaliação Enviada!",
          description: `Você deu **${stars} estrela${stars !== 1 ? "s" : ""}** para <@${claimerId}>. Obrigado pelo feedback!`,
        }),
      ]),
    } as never);

    logger.info({ openerId, claimerId, stars, channel: channel.name }, "Ticket rated");
  }
}

// ─── Sorteio ──────────────────────────────────────────────────────────────────

async function handleSorteioButton(
  interaction: ButtonInteraction,
  action: string,
  parts: string[]
) {
  if (action === "entrar") {
    // parts: ["sorteio", "entrar", channelId]
    const channelId = parts[2];
    if (!channelId) {
      await interaction.reply(v2EphemeralReply([errorContainer("Dados do sorteio inválidos.")]));
      return;
    }

    const messageId = sorteioByChannel.get(channelId);
    if (!messageId) {
      await interaction.reply(v2EphemeralReply([errorContainer("Este sorteio não está mais ativo.")]));
      return;
    }

    const entry = sorteioStore.get(messageId);
    if (!entry || entry.encerrado) {
      await interaction.reply(v2EphemeralReply([errorContainer("Este sorteio não está mais ativo.")]));
      return;
    }

    if (entry.participantes.has(interaction.user.id)) {
      await interaction.reply(v2EphemeralReply([errorContainer("Você já está participando deste sorteio! Boa sorte! 🍀")]));
      return;
    }

    entry.participantes.add(interaction.user.id);

    // Atualizar contagem de participantes na mensagem via REST
    const { container, actionRow } = buildSorteioComponents(entry);
    await interaction.client.rest
      .patch(Routes.channelMessage(entry.channelId, entry.messageId), {
        body: {
          components: [container.toJSON(), actionRow.toJSON()],
          flags: MessageFlags.IsComponentsV2,
        },
      })
      .catch((err) => logger.error({ err }, "Falha ao atualizar mensagem do sorteio"));

    await interaction.reply(
      v2EphemeralReply([
        successContainer(
          "Você entrou no sorteio!",
          `Boa sorte! 🍀\n**Prêmio:** ${entry.premio}\n**Participantes:** ${entry.participantes.size}`
        ),
      ])
    );

    logger.info({ userId: interaction.user.id, premio: entry.premio }, "Usuário entrou no sorteio");
  }
}
