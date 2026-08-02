import { SlashCommandBuilder, type ChatInputCommandInteraction, ButtonBuilder, ActionRowBuilder } from "discord.js";
import { type BotCommand } from "../index";
import { infoContainer, secondaryButton, row, MessageFlags } from "../v2/index";
import { getUser, getActiveBoostInfo, type ItemType, type SorteGame } from "../economyStore";

const E = {
  inventario: "<:comunidade2:1531072981688914103>",
  itens: "<:ticket_cart:1530817487372026016>",
  clock: "<:clock:1508157710422507663>",
};

const ITEM_LABELS: Record<ItemType, string> = {
  sorte2x: "2x Sorte",
  sorte5x: "5x Sorte",
  sorte10x: "10x Sorte",
  oraculo: "Oráculo",
};

const ITEM_ORDER: ItemType[] = ["sorte2x", "sorte5x", "sorte10x", "oraculo"];

const GAME_LABELS: Record<SorteGame, string> = {
  investimento: "Investimento",
  roleta: "Roleta",
  aviator: "Aviator",
  mines: "Mines",
};

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function boostLine(userId: string): string {
  const boost = getActiveBoostInfo(userId);
  if (!boost) return "";

  const gameLabel =
    boost.game === "investimento" ? `${GAME_LABELS.investimento} (Sala ${boost.room})` : GAME_LABELS[boost.game];

  return `\n\n${E.clock} Você tem um boost de **${boost.multiplier}x** em **${gameLabel}** e vai acabar em **${formatRemaining(boost.remainingMs)}**`;
}

export const inventarioCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("inventario")
    .setDescription("Mostra e ativa os itens que você ganhou na /loja"),

  async execute(interaction: ChatInputCommandInteraction) {
    const user = getUser(interaction.user.id);
    const owned = ITEM_ORDER.filter((item) => user.items[item] > 0);
    const boost = boostLine(interaction.user.id);

    if (owned.length === 0) {
      await interaction.reply({
        components: [
          infoContainer({
            title: `${E.inventario} Inventário`,
            description: `Você ainda não tem nenhum item. Use **/loja** pra tentar ganhar um.${boost}`,
          }),
        ],
        flags: MessageFlags.IsComponentsV2,
      } as never);
      return;
    }

    const lines = owned.map((item) => `> ${ITEM_LABELS[item]} (${user.items[item]})`).join("\n");
    const description = `* ${E.itens} **Itens:**\n${lines}${boost}`;

    const buttons: ButtonBuilder[] = owned.map((item) =>
      secondaryButton(`inventario:usar:${item}`, `Usar ${ITEM_LABELS[item]}`)
    );
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(row(...buttons.slice(i, i + 5)));
    }

    await interaction.reply({
      components: [infoContainer({ title: `${E.inventario} Inventário`, description }), ...rows],
      flags: MessageFlags.IsComponentsV2,
    } as never);
  },
};
