import {
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} from "discord.js";
import { infoContainer, errorContainer, successContainer, IS_COMPONENTS_V2, MessageFlags } from "../v2/index";
import {
  ativarSorte,
  usarOraculoInvestimento,
  usarOraculoAviator,
  type ItemType,
} from "../economyStore";

function fmtPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${(pct * 100).toFixed(1)}%`;
}

function fmtCrash(v: number): string {
  return `${v.toFixed(2)}x`;
}

// ─── Botão "Usar" de um item ─────────────────────────────────────────────────

export async function handleInventarioButton(interaction: ButtonInteraction, parts: string[]) {
  const [, action, item] = parts;
  if (action !== "usar" || !item) return;

  const isOraculo = item === "oraculo";

  const options: StringSelectMenuOptionBuilder[] = [
    new StringSelectMenuOptionBuilder().setLabel("Investimento — Sala 1").setValue("investimento:1"),
    new StringSelectMenuOptionBuilder().setLabel("Investimento — Sala 2").setValue("investimento:2"),
    new StringSelectMenuOptionBuilder().setLabel("Investimento — Sala 3").setValue("investimento:3"),
    new StringSelectMenuOptionBuilder().setLabel("Investimento — Sala 4").setValue("investimento:4"),
    new StringSelectMenuOptionBuilder().setLabel("Aviator").setValue("aviator"),
  ];
  if (!isOraculo) {
    options.push(
      new StringSelectMenuOptionBuilder().setLabel("Roleta").setValue("roleta"),
      new StringSelectMenuOptionBuilder().setLabel("Mines").setValue("mines")
    );
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`inventario:alvo:${item}`)
    .setPlaceholder("Onde você quer usar esse item?")
    .addOptions(options);

  const menuRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const description = isOraculo
    ? "O Oráculo só pode ser usado em **Investimento** (mostra os próximos 5 orçamentos) ou **Aviator** (mostra os próximos 5 voos). Escolha abaixo:"
    : "Escolha em qual jogo você quer usar esse item de sorte. Ele some assim que fizer efeito na próxima rodada/orçamento daquele jogo.";

  await interaction.reply({
    components: [infoContainer({ title: "Onde usar?", description }), menuRow],
    flags: IS_COMPONENTS_V2 | MessageFlags.Ephemeral,
  } as never);
}

// ─── Select menu de alvo ──────────────────────────────────────────────────────

export async function handleInventarioSelect(interaction: StringSelectMenuInteraction) {
  const [, , item] = interaction.customId.split(":") as [string, string, ItemType];
  const value = interaction.values[0]!;
  const userId = interaction.user.id;

  if (item === "oraculo") {
    if (value === "aviator") {
      const result = usarOraculoAviator(userId);
      if (!result.ok) {
        await interaction.update({
          components: [errorContainer("Você não tem mais nenhum Oráculo.")],
          flags: IS_COMPONENTS_V2,
        } as never);
        return;
      }
      const lines = result.forecast.map((cp, i) => `**Voo ${i + 1}:** ${fmtCrash(cp)}`).join("\n");
      await interaction.update({
        components: [
          successContainer(
            "🔮 Próximos 5 voos do Aviator",
            `${lines}\n\n-# Esses vão ser exatamente os próximos crashPoints das suas próximas 5 rodadas, na ordem.`
          ),
        ],
        flags: IS_COMPONENTS_V2,
      } as never);
      return;
    }

    const [, roomStr] = value.split(":");
    const room = Number(roomStr);
    const result = usarOraculoInvestimento(userId, room);
    if (!result.ok) {
      const msg = result.reason === "no_item" ? "Você não tem mais nenhum Oráculo." : "Sala inválida.";
      await interaction.update({ components: [errorContainer(msg)], flags: IS_COMPONENTS_V2 } as never);
      return;
    }
    const lines = result.forecast.map((pct, i) => `**Orçamento ${i + 1}:** ${fmtPct(pct)}`).join("\n");
    await interaction.update({
      components: [
        successContainer(
          `🔮 Próximos 5 orçamentos — Sala ${result.room}`,
          `${lines}\n\n-# Essas vão ser exatamente as próximas 5 variações de mercado dessa sala.`
        ),
      ],
      flags: IS_COMPONENTS_V2,
    } as never);
    return;
  }

  // Itens de sorte (sorte2x / sorte5x / sorte10x)
  const sorteItem = item as "sorte2x" | "sorte5x" | "sorte10x";
  let game: "investimento" | "roleta" | "aviator" | "mines";
  let room: number | undefined;

  if (value.startsWith("investimento:")) {
    game = "investimento";
    room = Number(value.split(":")[1]);
  } else {
    game = value as "roleta" | "aviator" | "mines";
  }

  const result = ativarSorte(userId, sorteItem, game, room);
  if (!result.ok) {
    const msg =
      result.reason === "no_item"
        ? "Você não tem mais nenhum desse item."
        : result.reason === "already_active"
          ? "Você já tem um boost de sorte ativo aguardando pra fazer efeito — use-o primeiro."
          : "Sala inválida.";
    await interaction.update({ components: [errorContainer(msg)], flags: IS_COMPONENTS_V2 } as never);
    return;
  }

  const gameLabel =
    result.game === "investimento"
      ? `Investimento (Sala ${result.room})`
      : result.game[0]!.toUpperCase() + result.game.slice(1);

  await interaction.update({
    components: [
      successContainer(
        "🍀 Sorte ativada!",
        `Seu boost de **${result.multiplier}x sorte** vai fazer efeito na sua próxima rodada/orçamento de **${gameLabel}**.`
      ),
    ],
    flags: IS_COMPONENTS_V2,
  } as never);
}
