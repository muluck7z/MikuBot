import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import { renderNegocios } from "../bancoViews";
import { errorContainer, v2EphemeralReply } from "../v2/index";

export const negociosCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("negocios")
    .setDescription("Mostra o histórico do mercado de investimentos de uma sala do banco")
    .addIntegerOption((option) =>
      option
        .setName("sala")
        .setDescription("Qual sala de investimento (1 a 4)")
        .setRequired(true)
        .addChoices(
          { name: "Sala 1", value: 1 },
          { name: "Sala 2", value: 2 },
          { name: "Sala 3", value: 3 },
          { name: "Sala 4", value: 4 }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const room = interaction.options.getInteger("sala", true);
    if (room < 1 || room > 4) {
      await interaction.reply(v2EphemeralReply([errorContainer("Sala inválida. Escolha entre 1 e 4.")]));
      return;
    }
    await interaction.reply(renderNegocios(interaction.user.id, room));
  },
};
