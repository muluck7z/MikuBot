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
} from "../v2/index";
import { logger } from "../../lib/logger";
import { ticketStore, ticketPanelConfig } from "../ticketStore";

const TICKET_EMOJI = "<:ticket:1508274275730063360>";
const SUPPORT_ROLE_ID = "1497801117940056125";

const TICKET_TYPE_LABELS: Record<string, string> = {
  suporte: "Suporte Geral",
  duvidas: "Dúvidas",
  denuncia: "Denúncia",
  financeiro: "Financeiro",
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
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, customId: interaction.customId }, "Select menu handler error");
    const fallback = v2EphemeralReply([errorContainer(`Não foi possível abrir o ticket. Tente novamente.\n\n\`${msg}\``)]);
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

  // Fetch all channels from the API (not cache) to get accurate state after restarts
  const allChannels = await guild.channels.fetch();

  const existing = allChannels.find((c) => c?.name === ticketName);
  if (existing) {
    await interaction.editReply(
      v2EphemeralReply([errorContainer(`Você já possui um ticket aberto: ${existing}\n\nFeche o ticket atual antes de abrir um novo.`)])
    );
    return;
  }

  let category = allChannels.find(
    (c) => c?.name.toLowerCase() === "tickets" && c.type === ChannelType.GuildCategory
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

  // Thumbnail configurada no painel (se houver)
  const thumbnailUrl = ticketPanelConfig.get(guild.id)?.thumbnailUrl;

  // Store ticket metadata for logs
  ticketStore.set(channel.id, {
    openerId: interaction.user.id,
    openerTag: interaction.user.tag,
    typeLabel,
    openedAt: new Date(),
    thumbnailUrl,
  });

  const btnCancel  = secondaryButton("ticket:cancel_user", "Cancelar");
  const btnClose   = dangerButton("ticket:confirm_close", "Fechar Ticket");
  const btnClaim   = secondaryButton("ticket:claim", "Assumir Ticket");

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
            "**Atenção:** caso nenhuma mensagem seja enviada, o ticket poderá ser encerrado automaticamente por inatividade.",
          ].join("\n"),
          // Usa thumbnail do painel se configurada, senão avatar do usuário
          avatarUrl: thumbnailUrl ?? interaction.user.displayAvatarURL({ size: 256 }),
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
