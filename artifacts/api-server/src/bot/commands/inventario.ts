import { SlashCommandBuilder, type ChatInputCommandInteraction, ButtonBuilder, ActionRowBuilder } from "discord.js";
import { type BotCommand } from "../index";
import { infoContainer, secondaryButton, row, v2Reply } from "../v2/index";
import { getUser, type ItemType } from "../economyStore";

const ITEM_LABELS: Record<ItemType, string> = {
  sorte2x: "🍀 2x Sorte",
  sorte5x: "🍀 5x Sorte",
  sorte10x: "🍀 10x Sorte",
  oraculo: "🔮 Oráculo",
};

const ITEM_ORDER: ItemType[] = ["sorte2x", "sorte5x", "sorte10x", "oraculo"];

export const inventarioCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("inventario")
    .setDescription("Mostra e ativa os itens que você ganhou na /loja"),

  async execute(interaction: ChatInputCommandInteraction) {
    const user = getUser(interaction.user.id);

    const owned = ITEM_ORDER.filter((item) => user.items[item] > 0);

    const boostLine = user.luckBoost
      ? user.luckBoost.game === "investimento"
        ? `\n⏳ Você já tem um boost de **${user.luckBoost.multiplier}x sorte** aguardando pra fazer efeito em **Investimento (Sala ${user.luckBoost.room})**.`
        : `\n⏳ Você já tem um boost de **${user.luckBoost.multiplier}x sorte** aguardando pra fazer efeito em **${user.luckBoost.game[0]!.toUpperCase()}${user.luckBoost.game.slice(1)}**.`
      : "";

    if (owned.length === 0) {
      await interaction.reply(
        v2Reply([
          infoContainer({
            title: "🎒 Inventário",
            description: `Você ainda não tem nenhum item. Use **/loja** pra tentar ganhar um.${boostLine}`,
          }),
        ])
      );
      return;
    }

    const lines = owned.map((item) => `**${ITEM_LABELS[item]}:** ${user.items[item]}x`).join("\n");

    const buttons: ButtonBuilder[] = owned.map((item) =>
      secondaryButton(`inventario:usar:${item}`, `Usar ${ITEM_LABELS[item].replace(/^\S+\s/, "")}`)
    );

    // Discord só permite até 5 botões por linha
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(row(...buttons.slice(i, i + 5)));
    }

    await interaction.reply(
      v2Reply(
        [infoContainer({ title: "🎒 Inventário", description: `${lines}${boostLine}` })],
        { buttons: rows }
      )
    );
  },
};
