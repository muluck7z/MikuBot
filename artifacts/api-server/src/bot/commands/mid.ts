import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import {
  errorContainer,
  v2EphemeralReply,
  IS_COMPONENTS_V2,
} from "../v2/index";
import { ticketPanelConfig } from "../ticketStore";

const MID_EMOJI = "🤝";

export const midCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("mid")
    .setDescription("Sistema de tickets MID")
    .addSubcommand((sub) =>
      sub
        .setName("painel")
        .setDescription("Envia o painel de abertura de tickets MID no canal atual")
        .addStringOption((opt) =>
          opt.setName("titulo").setDescription("Título do painel").setRequired(false)
        )
        .addStringOption((opt) =>
          opt
            .setName("thumbnail")
            .setDescription("URL da imagem que aparecerá no canto das embeds de ticket")
            .setRequired(false)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    if (!guild) return;

    if (sub === "painel") {
      const titulo =
        interaction.options.getString("titulo") ?? `${MID_EMOJI} Central de MID | Secret Forn`;
      const thumbnailRaw = interaction.options.getString("thumbnail");

      let thumbnailUrl: string | undefined;
      if (thumbnailRaw) {
        try {
          new URL(thumbnailRaw);
          thumbnailUrl = thumbnailRaw;
        } catch {
          await interaction.reply(
            v2EphemeralReply([errorContainer("A URL da thumbnail é inválida. Use uma URL completa (ex: https://...)")])
          );
          return;
        }
      }

      if (thumbnailUrl) {
        ticketPanelConfig.set(guild.id, { thumbnailUrl });
      }

      const btnOpen = new ButtonBuilder()
        .setCustomId("ticket:open_mid")
        .setLabel("Abrir MID")
        .setEmoji(MID_EMOJI)
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btnOpen);

      const descricao = [
        "Para realizar uma intermediação segura, abra um ticket abaixo.",
        "Somente a nossa equipe de MID terá acesso ao atendimento.",
        "Tenha em mãos o ID ou a menção do seu parceiro de troca.",
        "",
        "Clique no botão abaixo para iniciar:",
      ].join("\n");

      const container = new ContainerBuilder();

      if (thumbnailUrl) {
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${titulo}`))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl))
        );
      } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${titulo}`));
      }

      container
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(descricao))
        .addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addActionRowComponents(row)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent("-# Clique no botão para abrir seu ticket de MID")
        );

      await interaction.reply({
        components: [container],
        flags: IS_COMPONENTS_V2,
      } as never);
    }
  },
};
