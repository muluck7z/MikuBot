import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import { renderNegocios } from "../bancoViews";

export const negociosCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("negocios")
    .setDescription("Mostra o histórico do mercado de investimentos do banco"),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply(renderNegocios(interaction.user.id));
  },
};
