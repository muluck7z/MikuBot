import { type ButtonInteraction } from "discord.js";
import { infoContainer, errorContainer, primaryButton, row, v2Reply, v2EphemeralReply } from "../v2/index";
import { comprarLoja, type ItemType } from "../economyStore";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

const ITEM_LABELS: Record<ItemType, string> = {
  sorte2x: "🍀 2x Sorte",
  sorte5x: "🍀 5x Sorte",
  sorte10x: "🍀 10x Sorte",
  oraculo: "🔮 Oráculo",
};

export async function handleLojaButton(interaction: ButtonInteraction, parts: string[]) {
  const [, action] = parts;

  if (action === "girar") {
    const result = comprarLoja(interaction.user.id);

    if (!result.ok) {
      const msg =
        result.reason === "locked"
          ? "Sua conta está bloqueada — quite sua dívida para voltar a usar a loja."
          : "Você não tem fichas suficientes pra esse giro. Tente de novo, o custo é sorteado toda vez.";
      await interaction.reply(v2EphemeralReply([errorContainer(msg)]));
      return;
    }

    const description = result.item
      ? [
          `Você gastou **${fmt(result.cost)}** fichas e ganhou:`,
          "",
          `## ${ITEM_LABELS[result.item]}`,
          "",
          `Foi direto pro seu **/inventario**. Carteira restante: **${fmt(result.fichas)}** fichas.`,
        ].join("\n")
      : [
          `Você gastou **${fmt(result.cost)}** fichas e não veio nada dessa vez. 😔`,
          "",
          `Carteira restante: **${fmt(result.fichas)}** fichas.`,
        ].join("\n");

    await interaction.reply(
      v2Reply(
        [infoContainer({ title: result.item ? "🎉 Você ganhou um item!" : "🎰 Girou e não veio nada", description })],
        { buttons: [row(primaryButton("loja:girar", "🎰 Girar de novo"))] }
      )
    );
  }
}
