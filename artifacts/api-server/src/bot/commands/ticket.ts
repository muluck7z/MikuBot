import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { type BotCommand } from "../index";
import {
  infoContainer,
  successContainer,
  errorContainer,
  primaryButton,
  dangerButton,
  secondaryButton,
  row,
  v2Reply,
  v2EphemeralReply,
  COLORS,
} from "../v2/index";

export const ticketCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Sistema de tickets")
    .addSubcommand((sub) =>
      sub
        .setName("painel")
        .setDescription("Envia o painel de abertura de tickets no canal atual")
        .addStringOption((opt) =>
          opt.setName("titulo").setDescription("Título do painel").setRequired(false)
        )
        .addStringOption((opt) =>
          opt.setName("descricao").setDescription("Descrição do painel").setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("fechar").setDescription("Fecha o ticket atual")
    )
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Adiciona um usuário ao ticket")
        .addUserOption((opt) =>
          opt.setName("usuario").setDescription("Usuário a adicionar").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove um usuário do ticket")
        .addUserOption((opt) =>
          opt.setName("usuario").setDescription("Usuário a remover").setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    if (!guild) return;

    if (sub === "painel") {
      const titulo =
        interaction.options.getString("titulo") ?? "🎫 Central de Suporte";
      const descricao =
        interaction.options.getString("descricao") ??
        "Clique no botão abaixo para abrir um ticket.\nNossa equipe responderá em breve!";

      const btnAbrir = primaryButton("ticket:open", "🎫 Abrir Ticket");
      const btnFaq = secondaryButton("ticket:faq", "❓ FAQ");
      const btnStatus = secondaryButton("ticket:status", "📊 Status");

      await interaction.reply(
        v2Reply(
          [
            infoContainer({
              title: titulo,
              description: descricao,
              accentColor: COLORS.ticket,
            }),
          ],
          { buttons: [row(btnAbrir, btnFaq, btnStatus)] }
        )
      );
    } else if (sub === "fechar") {
      const channel = interaction.channel as TextChannel;
      if (!channel.name.startsWith("ticket-")) {
        await interaction.reply(v2EphemeralReply([errorContainer("Este canal não é um ticket.")]));
        return;
      }

      const btnConfirm = dangerButton("ticket:confirm_close", "✅ Confirmar Fechamento");
      const btnCancel = secondaryButton("ticket:cancel_close", "❌ Cancelar");

      await interaction.reply(
        v2Reply(
          [
            infoContainer({
              title: "🔒 Fechar Ticket",
              description:
                "Tem certeza que deseja fechar este ticket?\nO canal será excluído após a confirmação.",
              accentColor: COLORS.kick,
            }),
          ],
          { buttons: [row(btnConfirm, btnCancel)] }
        )
      );
    } else if (sub === "add") {
      const channel = interaction.channel as TextChannel;
      if (!channel.name.startsWith("ticket-")) {
        await interaction.reply(v2EphemeralReply([errorContainer("Este canal não é um ticket.")]));
        return;
      }
      const user = interaction.options.getUser("usuario", true);
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        await interaction.reply(v2EphemeralReply([errorContainer("Usuário não encontrado no servidor.")]));
        return;
      }

      await channel.permissionOverwrites.edit(member, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });

      await interaction.reply(
        v2Reply([successContainer("Usuário Adicionado", `${user} foi adicionado ao ticket.`)])
      );
    } else if (sub === "remove") {
      const channel = interaction.channel as TextChannel;
      if (!channel.name.startsWith("ticket-")) {
        await interaction.reply(v2EphemeralReply([errorContainer("Este canal não é um ticket.")]));
        return;
      }
      const user = interaction.options.getUser("usuario", true);
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        await interaction.reply(v2EphemeralReply([errorContainer("Usuário não encontrado no servidor.")]));
        return;
      }

      await channel.permissionOverwrites.edit(member, { ViewChannel: false });

      await interaction.reply(
        v2Reply([successContainer("Usuário Removido", `${user} foi removido do ticket.`)])
      );
    }
  },
};
