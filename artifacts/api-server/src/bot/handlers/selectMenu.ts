import {
  type StringSelectMenuInteraction,
  ChannelType,
  PermissionFlagsBits,
  type TextChannel,
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
  COLORS,
} from "../v2/index";
import { logger } from "../../lib/logger";

const TICKET_EMOJI = "<:ticket:1508274275730063360>";
const SUPPORT_ROLE_ID = "1497801117940056125";

const TICKET_TYPE_LABELS: Record<string, string> = {
  suporte: "🛠️ Suporte Geral",
  duvidas: "❓ Dúvidas",
  denuncia: "🚨 Denúncia",
  financeiro: "💰 Financeiro",
};

export async function handleSelectMenu(interaction: StringSelectMenuInteraction) {
  const [ns, action] = interaction.customId.split(":");

  try {
    if (ns === "ticket" && action === "type") {
      await handleTicketTypeSelect(interaction);
    } else {
      logger.warn({ customId: interaction.customId }, "Unknown select menu interaction");
    }
  } catch (err) {
    logger.error({ err, customId: interaction.customId }, "Select menu handler error");
    const fallback = v2EphemeralReply([errorContainer("Erro ao processar esta seleção.")]);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(fallback).catch(() => null);
    } else {
      await interaction.reply(fallback).catch(() => null);
    }
  }
}

async function handleTicketTypeSelect(interaction: StringSelectMenuInteraction) {
  const guild = interaction.guild;
  if (!guild) return;

  const ticketType = interaction.values[0]!;
  const typeLabel = TICKET_TYPE_LABELS[ticketType] ?? ticketType;

  await interaction.deferReply({ ephemeral: true });

  const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18);
  const ticketName = `ticket-${safeName}`;

  const existing = guild.channels.cache.find((c) => c.name === ticketName);
  if (existing) {
    await interaction.editReply(
      v2EphemeralReply([errorContainer(`Você já possui um ticket aberto: ${existing}\n\nFeche o ticket atual antes de abrir um novo.`)])
    );
    return;
  }

  let category = guild.channels.cache.find(
    (c) => c.name.toLowerCase() === "tickets" && c.type === ChannelType.GuildCategory
  );

  if (!category) {
    category = await guild.channels.create({
      name: "Tickets",
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      ],
    });
  }

  const botId = interaction.client.user.id;

  const channel = await guild.channels.create({
    name: ticketName,
    type: ChannelType.GuildText,
    parent: category.id,
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
      {
        id: SUPPORT_ROLE_ID,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ManageMessages,
        ],
      },
    ],
  });

  const btnCancel  = secondaryButton("ticket:cancel_user", "❌ Cancelar");
  const btnClose   = dangerButton("ticket:confirm_close", "🔒 Fechar Ticket");
  const btnClaim   = secondaryButton("ticket:claim", "🙋 Assumir Ticket");

  // Mention enviada separadamente — conteúdo de texto não pode ser misturado com IS_COMPONENTS_V2
  await (channel as TextChannel).send({
    content: `${interaction.user} | <@&${SUPPORT_ROLE_ID}>`,
    allowedMentions: { users: [interaction.user.id], roles: [SUPPORT_ROLE_ID] },
  });

  await (channel as TextChannel).send({
    ...v2Reply(
      [
        infoContainer({
          title: `${TICKET_EMOJI} Ticket Aberto — ${typeLabel}`,
          description: [
            `Olá, ${interaction.user}! Seu ticket foi aberto com sucesso.`,
            "",
            "Por favor, **descreva detalhadamente** o seu problema ou solicitação e aguarde — um membro da nossa equipe entrará em contato o mais breve possível.",
            "",
            "⚠️ **Atenção:** caso nenhuma mensagem seja enviada, o ticket poderá ser encerrado automaticamente por inatividade.",
          ].join("\n"),
          avatarUrl: interaction.user.displayAvatarURL({ size: 256 }),
          accentColor: COLORS.ticket,
        }),
      ],
      { buttons: [row(btnCancel, btnClose, btnClaim)] }
    ),
  });

  await interaction.editReply(
    v2EphemeralReply([successContainer("Ticket Aberto!", `Seu ticket foi criado em ${channel}`)])
  );

  logger.info(
    { user: interaction.user.tag, ticketType, channel: ticketName },
    "Ticket opened"
  );
}
