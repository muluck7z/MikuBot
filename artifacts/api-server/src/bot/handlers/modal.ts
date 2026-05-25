import { type ModalSubmitInteraction, EmbedBuilder, Colors } from "discord.js";
import { successContainer, errorContainer, v2EphemeralReply } from "../v2/index";
import { logger } from "../../lib/logger";

export async function handleModal(interaction: ModalSubmitInteraction) {
  const [ns, action, ...args] = interaction.customId.split(":");

  try {
    if (ns === "embed") {
      await handleEmbedModal(interaction, action!, args);
    } else {
      logger.warn({ customId: interaction.customId }, "Unknown modal interaction");
    }
  } catch (err) {
    logger.error({ err, customId: interaction.customId }, "Modal handler error");
    const fallback = v2EphemeralReply([errorContainer("Erro ao processar este formulário.")]);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(fallback).catch(() => null);
    } else {
      await interaction.reply(fallback).catch(() => null);
    }
  }
}

async function handleEmbedModal(
  interaction: ModalSubmitInteraction,
  action: string,
  args: string[]
) {
  if (action !== "create") return;

  const channelId = args[0];
  const guild = interaction.guild;
  if (!guild || !channelId) return;

  const title = interaction.fields.getTextInputValue("embed_title").trim();
  const description = interaction.fields.getTextInputValue("embed_description").trim();
  const colorRaw = interaction.fields.getTextInputValue("embed_color").trim();
  const footer = interaction.fields.getTextInputValue("embed_footer").trim();
  const imageUrl = interaction.fields.getTextInputValue("embed_image").trim();

  let color: number = Colors.Blurple;
  if (colorRaw) {
    const parsed = parseInt(colorRaw.replace("#", ""), 16);
    if (!isNaN(parsed)) color = parsed;
  }

  const embed = new EmbedBuilder().setColor(color).setDescription(description || null);
  if (title) embed.setTitle(title);
  if (footer) embed.setFooter({ text: footer });
  if (imageUrl) {
    try {
      new URL(imageUrl);
      embed.setImage(imageUrl);
    } catch {
      // ignore invalid URL
    }
  }
  embed.setTimestamp();

  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) {
    await interaction.reply(v2EphemeralReply([errorContainer("Canal não encontrado ou inválido.")]));
    return;
  }

  await channel.send({ embeds: [embed] });

  const targetMention = channelId === interaction.channelId ? "neste canal" : `em <#${channelId}>`;
  await interaction.reply(
    v2EphemeralReply([successContainer("Embed Enviado", `O embed foi enviado com sucesso ${targetMention}.`)])
  );
}
