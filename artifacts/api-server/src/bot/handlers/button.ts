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
import { handleBancoButton } from "./banco";
import { handleCassinoButton } from "./cassino";
import { handleAviatorButton } from "./aviator";
import { handleLojaButton } from "./loja";
import { handleInventarioButton } from "./inventario";
import { handleResetButton } from "./reset";

const TICKET_EMOJI = "<:ticket:1508274275730063360>";
const RATING_CHANNEL_ID = "1512670969653887137";
const LOG_CHANNEL_ID    = "1512670984572764303";
const MID_RATING_CHANNEL_ID = "1522014597123539044";

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
  const ESTRELA = "<a:estrela:1508926292513521837>";
  return ESTRELA.repeat(stars);
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

  // Thumbnail do log = avatar do responsável (claimer)
  let claimerAvatarUrl: string | undefined;
  if (claimerId) {
    try {
      const claimerMember = await guild.members.fetch(claimerId);
      claimerAvatarUrl = claimerMember.user.displayAvatarURL({ size: 256 });
    } catch {
      // sem avatar disponível
    }
  }
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
      infoContainer({ title, description: lines.join("\n"), avatarUrl: claimerAvatarUrl }),
    ]),
  });

  ticketStore.delete(channel.id);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

import { ChannelType } from "discord.js";
import { midSessions, ticketPanelConfig } from "../ticketStore";

async function handleOpenMid(interaction: ButtonInteraction) {
  const guild = interaction.guild;
  if (!guild) return;

  await interaction.deferReply({ ephemeral: true });

  const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18);
  const ticketName = `mid-${safeName}`;

  const allChannels = await guild.channels.fetch();
  const existing = allChannels.find((c) => c?.name === ticketName);
  if (existing) {
    await interaction.editReply(
      v2EphemeralReply([errorContainer(`Você já possui um ticket de MID aberto: ${existing}`)])
    );
    return;
  }

  let category = allChannels.find(
    (c) => c?.name.toLowerCase() === "tickets mid" && c.type === ChannelType.GuildCategory
  );

  if (!category) {
    category = await guild.channels.create({
      name: "Tickets MID",
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      ],
    });
  }

  const MID_ROLES = ["1522025707780440094", "1457907642633818204"];
  const botId = interaction.client.user.id;

  const channel = await guild.channels.create({
    name: ticketName,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: interaction.user.id,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: botId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ManageChannels,
        ],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      ...MID_ROLES.map(roleId => ({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ManageMessages,
        ],
      }))
    ],
  });

  const thumbnailUrl = ticketPanelConfig.get(guild.id)?.thumbnailUrl;

  ticketStore.set(channel.id, {
    openerId: interaction.user.id,
    openerTag: interaction.user.tag,
    typeLabel: "MID",
    openedAt: new Date(),
    thumbnailUrl,
  });

  midSessions.set(channel.id, {
    openerId: interaction.user.id,
    guildId: guild.id,
    channelId: channel.id,
    step: "partner",
  });

  const btnCancel = secondaryButton("ticket:cancel_user", "Cancelar");
  const btnClose = dangerButton("ticket:confirm_close", "Fechar Ticket");
  const btnClaim = secondaryButton("ticket:claim", "Assumir Ticket");

  await (channel as TextChannel).send({
    content: `${interaction.user} | <@&${MID_ROLES[0]}> | <@&${MID_ROLES[1]}> O atendimento arca em respeito com os termos`,
    allowedMentions: { users: [interaction.user.id], roles: MID_ROLES },
  });

  await (channel as TextChannel).send({
    ...v2Reply(
      [
        infoContainer({
          title: `🤝 Ticket de MID Aberto`,
          description: [
            `Olá, ${interaction.user}! Seu ticket de intermediação foi aberto.`,
            "",
            "⚠️ **Atenção:** Este atendimento pode ter um custo financeiro de **1 a 2 reais** pelo serviço de intermediação.",
            "",
            "📋 **Para agilizar o atendimento, por favor informe:**",
            "• Quem vai **vender** e quem vai **comprar** (ou se é uma troca)",
            "• **O que** será vendido/comprado/trocado",
            "• Qualquer detalhe importante da negociação",
            "",
            "**Mencione ou envie o ID do seu parceiro de troca** para que ele seja adicionado ao ticket.",
            "",
            "🕐 Um middleman irá atendê-los assim que possível!",
          ].join("\n"),
          avatarUrl: thumbnailUrl ?? interaction.user.displayAvatarURL({ size: 256 }),
        }),
      ],
      { buttons: [row(btnCancel, btnClose, btnClaim)] }
    ),
  });

  await (channel as TextChannel).send({
    content: `${interaction.user}, por favor mencione ou pegue o ID do usuário com que você deseja negociar que vou agora mesmo puxar ele para cá!`,
    allowedMentions: { users: [interaction.user.id] },
  });

  await interaction.editReply(
    v2EphemeralReply([successContainer("Ticket Aberto!", `Seu ticket de MID foi criado em ${channel}`)])
  );
}

export async function handleButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const [ns, action] = parts;

  try {
    if (ns === "ticket") {
      if (action === "open_mid") {
        await handleOpenMid(interaction);
      } else {
        await handleTicketButton(interaction, action!, parts);
      }
    } else if (ns === "sorteio") {
      await handleSorteioButton(interaction, action!, parts);
    } else if (ns === "banco") {
      await handleBancoButton(interaction, parts);
    } else if (ns === "cassino") {
      await handleCassinoButton(interaction, parts);
    } else if (ns === "aviator") {
      await handleAviatorButton(interaction, parts);
    } else if (ns === "loja") {
      await handleLojaButton(interaction, parts);
    } else if (ns === "inventario") {
      await handleInventarioButton(interaction, parts);
    } else if (ns === "reset") {
      await handleResetButton(interaction, parts);
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
    if (!channel.name.startsWith("ticket-") && !channel.name.startsWith("mid-")) {
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
      const meta = ticketStore.get(channel.id);
      const partnerId = meta?.partnerId;
      const isMid = channel.name.startsWith("mid-");

      const STAR = { name: "estrela", id: "1508926292513521837", animated: true };
      const thumbTicket = meta?.thumbnailUrl;

      // Card para o Opener
      const btn1O = new ButtonBuilder().setCustomId(`ticket:rate:1:${claimerId}:${openerId}`).setLabel("1").setEmoji(STAR).setStyle(ButtonStyle.Secondary);
      const btn2O = new ButtonBuilder().setCustomId(`ticket:rate:2:${claimerId}:${openerId}`).setLabel("2").setEmoji(STAR).setStyle(ButtonStyle.Secondary);
      const btn3O = new ButtonBuilder().setCustomId(`ticket:rate:3:${claimerId}:${openerId}`).setLabel("3").setEmoji(STAR).setStyle(ButtonStyle.Secondary);

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
              avatarUrl: thumbTicket,
            }),
          ],
          { buttons: [row(btn1O, btn2O, btn3O)] }
        ),
      });

      // Card para o Parceiro (se for MID)
      if (isMid && partnerId) {
        const btn1P = new ButtonBuilder().setCustomId(`ticket:rate:1:${claimerId}:${partnerId}`).setLabel("1").setEmoji(STAR).setStyle(ButtonStyle.Secondary);
        const btn2P = new ButtonBuilder().setCustomId(`ticket:rate:2:${claimerId}:${partnerId}`).setLabel("2").setEmoji(STAR).setStyle(ButtonStyle.Secondary);
        const btn3P = new ButtonBuilder().setCustomId(`ticket:rate:3:${claimerId}:${partnerId}`).setLabel("3").setEmoji(STAR).setStyle(ButtonStyle.Secondary);

        await channel.send({
          content: `<@${partnerId}>`,
          allowedMentions: { users: [partnerId] },
        });

        await channel.send({
          ...v2Reply(
            [
              infoContainer({
                title: "Avaliação de Atendimento (Parceiro)",
                description: `Qual nota você daria para o atendimento de <@${claimerId}>?`,
                avatarUrl: thumbTicket,
              }),
            ],
            { buttons: [row(btn1P, btn2P, btn3P)] }
          ),
        });
      }
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
    if (!channel.name.startsWith("ticket-") && !channel.name.startsWith("mid-")) {
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
    if (!channel.name.startsWith("ticket-") && !channel.name.startsWith("mid-")) {
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
    if (!channel.name.startsWith("ticket-") && !channel.name.startsWith("mid-")) {
      await interaction.reply(v2EphemeralReply([errorContainer("Este canal não é um ticket.")]));
      return;
    }

    const isMid = channel.name.startsWith("mid-");
    const MID_STAFF_ROLE = "1522025707780440094";
    const TICKET_STAFF_ROLES = ["1497801117940056125", "1457907642633818204"];

    const member = await guild.members.fetch(interaction.user.id).catch(() => null);

    let canClaim = false;
    if (member) {
      if (member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        canClaim = true;
      } else if (isMid) {
        // Apenas o cargo MID pode assumir tickets MID
        canClaim = member.roles.cache.has(MID_STAFF_ROLE);
      } else {
        canClaim = TICKET_STAFF_ROLES.some((id) => member.roles.cache.has(id));
      }
    }

    if (!canClaim) {
      const errorMsg = isMid
        ? "Apenas membros com o cargo de MID podem assumir este ticket."
        : "Você não tem permissão para assumir tickets.";
      await interaction.reply(v2EphemeralReply([errorContainer(errorMsg)]));
      return;
    }

    // Check if already claimed
    const topicRaw = channel.topic ?? "";
    if (topicRaw.includes(":")) {
      const existingClaimerId = topicRaw.split(":")[1];
      await interaction.reply(
        v2EphemeralReply([errorContainer(`Este ticket já foi assumido por <@${existingClaimerId}>. Apenas uma pessoa pode ser responsável pelo atendimento.`)])
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
    const openerId = topicRaw;
    if (openerId) {
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
    // parts: ["ticket", "rate", stars, claimerId, targetUserId]
    const [, , starsStr, claimerId, targetUserId] = parts;
    const stars = parseInt(starsStr ?? "0", 10);

    if (!claimerId || !targetUserId || isNaN(stars)) {
      await interaction.reply(v2EphemeralReply([errorContainer("Dados de avaliação inválidos.")]));
      return;
    }

    // Only the targeted user can click this button
    if (interaction.user.id !== targetUserId) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("Você não pode avaliar no card de outro usuário.")])
      );
      return;
    }

    const channel = interaction.channel as TextChannel;
    const isMid = channel.name.startsWith("mid-");
    const meta = ticketStore.get(channel.id);

    if (!meta) {
      await interaction.reply(v2EphemeralReply([errorContainer("Metadados do ticket não encontrados.")]));
      return;
    }

    // Update the correct rating field
    if (targetUserId === meta.openerId) {
      meta.rating = stars;
    } else if (isMid && targetUserId === meta.partnerId) {
      meta.partnerRating = stars;
    } else {
      await interaction.reply(v2EphemeralReply([errorContainer("Você não faz parte deste ticket como solicitante ou parceiro.")]));
      return;
    }

    // If it's MID, check if both have rated
    const bothRated = !isMid || (meta.rating !== undefined && meta.partnerRating !== undefined);

    if (bothRated) {
      const ratingChannelId = isMid ? MID_RATING_CHANNEL_ID : RATING_CHANNEL_ID;
      const ratingChannel = guild.channels.cache.get(ratingChannelId) as TextChannel | undefined;
      
      if (ratingChannel) {
        const description = isMid 
          ? [
              `**Atendente:** <@${claimerId}>`,
              "",
              `**Solicitante:** <@${meta.openerId}>`,
              `**Nota:** ${starLabel(meta.rating!)} (${meta.rating}/3)`,
              "",
              `**Parceiro:** <@${meta.partnerId}>`,
              `**Nota:** ${starLabel(meta.partnerRating!)} (${meta.partnerRating}/3)`,
            ].join("\n")
          : [
              `**Atendente:** <@${claimerId}>`,
              `**Avaliado por:** <@${meta.openerId}>`,
              `**Nota:** ${starLabel(meta.rating!)} (${meta.rating}/3)`,
            ].join("\n");

        await ratingChannel.send({
          ...v2Reply([
            infoContainer({
              title: "Nova Avaliação de Atendimento",
              description,
              avatarUrl: meta.thumbnailUrl ?? interaction.user.displayAvatarURL({ size: 256 }),
            }),
          ]),
        });
      }
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

    logger.info({ userId: targetUserId, claimerId, stars, channel: channel.name }, "Ticket rated");
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
