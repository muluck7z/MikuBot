import { type StringSelectMenuInteraction } from "discord.js";
import { infoContainer, v2EphemeralReply } from "../v2/index";
import { logger } from "../../lib/logger";

export async function handleSelectMenu(interaction: StringSelectMenuInteraction) {
  try {
    logger.info({ customId: interaction.customId, values: interaction.values }, "Select menu interaction");
    await interaction.reply(
      v2EphemeralReply([infoContainer({ title: "Seleção recebida", description: `Valor: ${interaction.values.join(", ")}` })])
    );
  } catch (err) {
    logger.error({ err, customId: interaction.customId }, "Select menu handler error");
    await interaction.reply(v2EphemeralReply([infoContainer({ title: "Erro", description: "Erro ao processar seleção." })])).catch(() => null);
  }
}
