import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { type BotCommand } from "../index";
import { renderCassinoHome } from "../cassinoViews";

export const cassinoCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("cassino")
    .setDescription("Abre o Cassino Brazino 777"),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply(renderCassinoHome(interaction.user.id) as never);
  },
};
