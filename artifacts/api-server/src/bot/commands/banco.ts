import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import { renderHome } from "../bancoViews";

export const bancoCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("banco")
    .setDescription("Abre o banco do servidor (empréstimos, conversão, carteira e investimentos)"),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply(renderHome(interaction.user.id));
  },
};
