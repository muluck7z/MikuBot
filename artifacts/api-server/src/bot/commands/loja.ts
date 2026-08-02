import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { type BotCommand } from "../index";
import { infoContainer, secondaryButton, row, MessageFlags } from "../v2/index";
import { rollLojaCost } from "../economyStore";

const E = {
  loja: "<:ticket_cart:1530817487372026016>",
};

function fmt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

function screen(container: ReturnType<typeof infoContainer>, ...rows: ReturnType<typeof row>[]) {
  return {
    components: [container, ...rows],
    flags: MessageFlags.IsComponentsV2,
  };
}

export const lojaCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("loja")
    .setDescription("Abre a Loja de itens da economia"),

  async execute(interaction: ChatInputCommandInteraction) {
    const cost = rollLojaCost(interaction.user.id);

    const description = [
      "Gire a roleta da loja e tente sua sorte! Cada giro custa um valor aleatório entre 5% e 20% do que você tem na carteira, tirado direto dela.",
      "",
      "**Chances de itens por giro:**",
      "> Nada: 50%",
      "> 2x Sorte: 35%",
      "> 5x Sorte: 25%",
      "> 10x Sorte: 15%",
      "> Oráculo: 10%",
      "",
      "**O que cada item faz:**",
      "> **2x/ 5x / 10x Sorte** - item de uso único e duração de 5 minutos: aumenta as suas chances de um resultado melhor na próxima rodada de Investimento, Roleta, Aviator ou Mines (você escolhe onde usar).",
      "> **Oráculo** - item de uso único, o mais raro: revela os próximos 5 orçamentos de uma sala de investimento, ou os próximos 5 voos do Aviator antes de eles acontecerem.",
      "",
      "Os itens que você ganhar vão para o **/inventario**, onde podem ser ativados.",
      "",
      `Este giro vai custar: **${fmt(cost)}**`,
    ].join("\n");

    await interaction.reply(
      screen(
        infoContainer({ title: `${E.loja} Loja`, description }),
        row(secondaryButton(`loja:girar:${cost}`, "Girar"))
      ) as never
    );
  },
};
