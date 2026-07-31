import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { type BotCommand } from "../index";
import { infoContainer, primaryButton, row, v2Reply } from "../v2/index";

export const lojaCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("loja")
    .setDescription("Abre a Loja de itens da economia"),

  async execute(interaction: ChatInputCommandInteraction) {
    const description = [
      "Gire a roleta da loja e tente sua sorte! Cada giro custa um valor **aleatório entre 100M e 1T** de fichas, tirado direto da sua carteira.",
      "",
      "**Chances por giro:**",
      "> **Nada:** 50%",
      "> **2x Sorte:** 35%",
      "> **5x Sorte:** 25%",
      "> **10x Sorte:** 15%",
      "> **Oráculo:** 10%",
      "",
      "**O que cada item faz:**",
      "> **2x / 5x / 10x Sorte** — item de uso único: aumenta as suas chances de um resultado melhor na próxima rodada de **Investimento**, **Roleta**, **Aviator** ou **Mines** (você escolhe onde usar).",
      "> **Oráculo** — item de uso único, o mais raro: revela os próximos 5 orçamentos de uma sala de Investimento, ou os próximos 5 voos do Aviator antes de eles acontecerem.",
      "",
      "Os itens que você ganhar vão para o **/inventario**, onde podem ser ativados.",
    ].join("\n");

    await interaction.reply(
      v2Reply(
        [infoContainer({ title: "🛒 Loja", description })],
        { buttons: [row(primaryButton("loja:girar", "🎰 Girar"))] }
      )
    );
  },
};
