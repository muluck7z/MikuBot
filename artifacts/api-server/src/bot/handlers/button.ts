import {
  type ButtonInteraction,
  PermissionFlagsBits,
  type TextChannel,
} from "discord.js";
import {
  infoContainer,
  successContainer,
  errorContainer,
  dangerButton,
  secondaryButton,
  primaryButton,
  row,
  v2Reply,
  v2EphemeralReply,
} from "../v2/index";
import { logger } from "../../lib/logger";

const TICKET_EMOJI = "<:ticket:1508274275730063360>";
const RATING_CHANNEL_ID = "1497778916859973783";

export async function handleButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const [ns, action] = parts;

  try {
    if (ns === "ticket") {
      await handleTicketButton(interaction, action!, parts);
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
      const btn1 = secondaryButton(`ticket:rate:1:${claimerId}:${openerId}`, "★  1 Estrela");
      const btn2 = secondaryButton(`ticket:rate:2:${claimerId}:${openerId}`, "★★  2 Estrelas");
      const btn3 = primaryButton(`ticket:rate:3:${claimerId}:${openerId}`, "★★★  3 Estrelas");

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

    // Update topic to "openerId:claimerId" so we can use it for rating later
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

    const starLabel = "★".repeat(stars) + "☆".repeat(3 - stars);
    const channel = interaction.channel as TextChannel;

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
              `**Ticket:** ${channel.name}`,
              `**Nota:** ${starLabel} (${stars}/3)`,
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
