import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  type ChatInputCommandInteraction,
  ChannelType,
} from "discord.js";
import { type BotCommand } from "../index";

export const embedCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Cria e envia um embed customizado")
    .addSubcommand((sub) =>
      sub
        .setName("criar")
        .setDescription("Abre o formulário para criar um embed")
        .addChannelOption((opt) =>
          opt
            .setName("canal")
            .setDescription("Canal onde o embed será enviado (padrão: atual)")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction: ChatInputCommandInteraction) {
    const canal = interaction.options.getChannel("canal");
    const targetId = canal?.id ?? interaction.channelId;

    const modal = new ModalBuilder()
      .setCustomId(`embed:create:${targetId}`)
      .setTitle("Criar Embed");

    const titleInput = new TextInputBuilder()
      .setCustomId("embed_title")
      .setLabel("Título")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(256)
      .setPlaceholder("Título do embed...");

    const descInput = new TextInputBuilder()
      .setCustomId("embed_description")
      .setLabel("Descrição")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(4000)
      .setPlaceholder("Conteúdo do embed...");

    const colorInput = new TextInputBuilder()
      .setCustomId("embed_color")
      .setLabel("Cor (hex, ex: #5865F2)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(7)
      .setPlaceholder("#5865F2");

    const footerInput = new TextInputBuilder()
      .setCustomId("embed_footer")
      .setLabel("Rodapé")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(2048)
      .setPlaceholder("Texto do rodapé...");

    const imageInput = new TextInputBuilder()
      .setCustomId("embed_image")
      .setLabel("URL da imagem (opcional)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder("https://...");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(colorInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(footerInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput),
    );

    await interaction.showModal(modal);
  },
};
