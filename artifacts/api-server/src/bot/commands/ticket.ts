import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { type BotCommand } from "../index";
import {
  successContainer,
  errorContainer,
  dangerButton,
  secondaryButton,
  row,
  v2Reply,
  v2EphemeralReply,
  IS_COMPONENTS_V2,
  COLORS,
} from "../v2/index";

const TICKET_EMOJI = "<:ticket:1508274275730063360>";

const TICKET_TYPES = [
  { label: "Suporte Geral", value: "suporte", description: "Problemas gerais ou solicitações de suporte", emoji: "🛠️" },
  { label: "Dúvidas", value: "duvidas", description: "Tire suas dúvidas com nossa equipe", emoji: "❓" },
  { label: "Denúncia", value: "denuncia", description: "Reporte um usuário ou situação", emoji: "🚨" },
  { label: "Financeiro", value: "financeiro", description: "Questões relacionadas a pagamentos", emoji: "💰" },
];

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
        interaction.options.getString("titulo") ?? `${TICKET_EMOJI} Central de Atendimento | Secret Forn`;

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("ticket:type")
        .setPlaceholder("Selecione o tipo de atendimento...")
        .addOptions(
          TICKET_TYPES.map((t) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(t.label)
              .setValue(t.value)
              .setDescription(t.description)
              .setEmoji(t.emoji)
          )
        );

      const menuRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

      const descricao =
        "Após solicitar um atendimento, aguarde um integrante da equipe responde-lo(a). " +
        "O atendimento é realizado de forma privada, contudo, somente integrantes da equipe terá acesso ao atendimento. " +
        "Tenha ciência que a nossa equipe não se encontra presente 24 horas por dia, contudo, dentro dos horários " +
        "citados acima nossa equipe se encontra disponibilizada a atende-lo(a).\n" +
        "Clique nos botões abaixo para continuar:";

      const container = new ContainerBuilder()
        .setAccentColor(COLORS.ticket)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${titulo}`))
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(descricao))
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addActionRowComponents(menuRow)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent("-# Selecione uma opção para abrir seu ticket")
        );

      await interaction.reply({
        components: [container],
        flags: IS_COMPONENTS_V2,
      } as never);
    } else if (sub === "fechar") {
      const channel = interaction.channel as TextChannel;
      if (!channel.name.startsWith("ticket-")) {
        await interaction.reply(v2EphemeralReply([errorContainer("Este canal não é um ticket.")]));
        return;
      }

      const btnConfirm = dangerButton("ticket:confirm_close", "🔒 Fechar Ticket");
      const btnCancel = secondaryButton("ticket:cancel_close", "❌ Cancelar");

      await interaction.reply(
        v2Reply(
          [
            infoContainer({
              title: "🔒 Fechar Ticket",
              description:
                "Tem certeza que deseja fechar este ticket?\nO canal será excluído em **30 segundos** após a confirmação.",
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
