import {
  type ButtonInteraction,
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

export async function handleButton(interaction: ButtonInteraction) {
  const [ns, action] = interaction.customId.split(":");

  try {
    if (ns === "ticket") {
      await handleTicketButton(interaction, action!);
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

async function handleTicketButton(interaction: ButtonInteraction, action: string) {
  const guild = interaction.guild;
  if (!guild) return;

  if (action === "open") {
    await interaction.deferReply({ flags: 64 });

    const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
    const ticketName = `ticket-${safeName}`;

    const existing = guild.channels.cache.find((c) => c.name === ticketName);
    if (existing) {
      await interaction.editReply(
        v2EphemeralReply([errorContainer(`Você já possui um ticket aberto: ${existing}`)])
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

    const channel = await guild.channels.create({
      name: ticketName,
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
          ],
        },
      ],
    });

    const btnClose = dangerButton("ticket:confirm_close", "🔒 Fechar Ticket");
    const btnClaim = secondaryButton("ticket:claim", "🙋 Assumir Ticket");

    await (channel as TextChannel).send({
      content: `${interaction.user}`,
      ...v2Reply(
        [
          infoContainer({
            title: "🎫 Ticket Aberto",
            description: [
              `Olá, ${interaction.user}! Bem-vindo ao seu ticket.`,
              "",
              "**Como podemos te ajudar?**",
              "Descreva seu problema ou dúvida e nossa equipe responderá em breve.",
            ].join("\n"),
            avatarUrl: interaction.user.displayAvatarURL({ size: 256 }),
            accentColor: COLORS.ticket,
          }),
        ],
        { buttons: [row(btnClose, btnClaim)] }
      ),
    });

    await interaction.editReply(
      v2EphemeralReply([successContainer("Ticket Criado", `Seu ticket foi aberto em ${channel}`)])
    );
  } else if (action === "confirm_close") {
    const channel = interaction.channel as TextChannel;
    if (!channel.name.startsWith("ticket-")) {
      await interaction.reply(v2EphemeralReply([errorContainer("Este canal não é um ticket.")]));
      return;
    }

    await interaction.reply(
      v2Reply([
        infoContainer({
          title: "🔒 Fechando ticket...",
          description: "Este canal será excluído em 5 segundos.",
          accentColor: COLORS.lock,
        }),
      ])
    );

    setTimeout(() => {
      channel.delete("Ticket fechado").catch(() => null);
    }, 5000);
  } else if (action === "cancel_close") {
    await interaction.reply(
      v2EphemeralReply([successContainer("Cancelado", "O fechamento do ticket foi cancelado.")])
    );
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

    await interaction.reply(
      v2Reply([
        infoContainer({
          title: "🙋 Ticket Assumido",
          description: `${interaction.user} está atendendo este ticket.`,
          avatarUrl: interaction.user.displayAvatarURL({ size: 256 }),
          accentColor: COLORS.success,
        }),
      ])
    );
  } else if (action === "faq") {
    await interaction.reply(
      v2EphemeralReply([
        infoContainer({
          title: "❓ Perguntas Frequentes",
          description: [
            "**Como abrir um ticket?**",
            "Clique no botão 🎫 Abrir Ticket.",
            "",
            "**Quanto tempo leva para resposta?**",
            "Nossa equipe responde em até 24 horas.",
            "",
            "**Posso abrir mais de um ticket?**",
            "Não, apenas um ticket por vez é permitido.",
          ].join("\n"),
          accentColor: COLORS.primary,
        }),
      ])
    );
  } else if (action === "status") {
    const ticketCount = guild.channels.cache.filter((c) => c.name.startsWith("ticket-")).size;
    await interaction.reply(
      v2EphemeralReply([
        infoContainer({
          title: "📊 Status do Suporte",
          description: `Tickets abertos: **${ticketCount}**\nNossa equipe está online e pronta para ajudar!`,
          accentColor: COLORS.success,
        }),
      ])
    );
  }
}
