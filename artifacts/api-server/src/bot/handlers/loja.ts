import { type ButtonInteraction } from "discord.js";
import { infoContainer, errorContainer, secondaryButton, row, MessageFlags } from "../v2/index";
import { comprarLoja, type ItemType } from "../economyStore";

const E = {
  ganhou: "<a:presente_storm:1530817591205957822>",
  nada: "<a:emoji_1838:1508159758685962452>",
  item: "<:parceria:1531111024369995868>",
  saldo: "<:em:1531074006978138292>",
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

const ITEM_LABELS: Record<ItemType, string> = {
  sorte2x: "2x Sorte",
  sorte5x: "5x Sorte",
  sorte10x: "10x Sorte",
  oraculo: "Oráculo",
};

export async function handleLojaButton(interaction: ButtonInteraction, parts: string[]) {
  const [, action, presetCostRaw] = parts;
  if (action !== "girar") return;

  // O primeiro giro (vindo do /loja) já mostrou o custo antes — cobra exatamente esse valor.
  // "Girar novamente" não traz custo no customId, então sorteia um novo na hora.
  const presetCost = presetCostRaw && presetCostRaw !== "_" ? Number(presetCostRaw) : undefined;

  const result = comprarLoja(interaction.user.id, presetCost);

  if (!result.ok) {
    const msg =
      result.reason === "locked"
        ? "Sua conta está bloqueada — quite sua dívida para voltar a usar a loja."
        : "Você não tem fichas suficientes pra esse giro.";
    await interaction.update(screen(errorContainer(msg)) as never);
    return;
  }

  const girarNovamente = row(secondaryButton("loja:girar", "Girar novamente"));

  if (result.item) {
    const description = [
      `> Você gastou **${fmt(result.cost)}** fichas e ganhou:`,
      "",
      `${E.item} **${ITEM_LABELS[result.item]}**`,
      "> Foi direto pro seu **/inventario.**",
      "",
      `${E.saldo} **Saldo restante:** ${fmt(result.fichas)}`,
    ].join("\n");

    await interaction.update(
      screen(infoContainer({ title: `${E.ganhou} Você ganhou um Item!`, description }), girarNovamente) as never
    );
    return;
  }

  const description = [
    `> Você gastou **${fmt(result.cost)}** fichas e não veio nada dessa vez.`,
    "",
    `${E.saldo} **Saldo restante:** ${fmt(result.fichas)}`,
  ].join("\n");

  await interaction.update(
    screen(infoContainer({ title: `${E.nada} Veio nada`, description }), girarNovamente) as never
  );
}
