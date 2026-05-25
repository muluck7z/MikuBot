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

const TICKET_EMOJI = "<:ticket:1508274275730063360>";

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

    setTimeout(async () => {
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

    setTimeout(async () => {
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
  }
}
