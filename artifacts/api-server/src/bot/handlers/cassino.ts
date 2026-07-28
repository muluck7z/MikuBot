import {
  type ButtonInteraction,
  type ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import { errorContainer, successContainer, v2EphemeralReply } from "../v2/index";
import { renderCassinoHome, renderRoleta, renderAviator } from "../cassinoViews";
import {
  depositarCassino,
  configurarRodada,
  girarRoleta,
  sacarCassino,
  sairCassino,
  type RoletaCor,
  ROLETA_NUMEROS,
} from "../economyStore";
import { registerAviatorMessage, ensureAviatorLoop } from "./aviator";
import type { Message } from "discord.js";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

/** Converte o texto digitado pelo usuário num inteiro positivo (aceita "50.000" ou "50000"). */
function parseAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/[.\s]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.floor(n);
  if (rounded < 1) return null;
  return rounded;
}

function parseCor(raw: string): RoletaCor | null {
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === "branco" || cleaned === "b") return "branco";
  if (cleaned === "preto" || cleaned === "p") return "preto";
  return null;
}

function parseNumero(raw: string): number | null {
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 1 || n > ROLETA_NUMEROS) return null;
  return n;
}

async function toast(interaction: ButtonInteraction | ModalSubmitInteraction, description: string, ok: boolean) {
  await interaction.followUp(
    v2EphemeralReply([ok ? successContainer("Sucesso!", description) : errorContainer(description)])
  );
}

export async function handleCassinoButton(interaction: ButtonInteraction, parts: string[]) {
  // customId: cassino:<action>:<arg|_>:<ownerId>
  const [, action, , ownerId] = parts;

  if (!ownerId) return;
  if (interaction.user.id !== ownerId) {
    await interaction.reply(
      v2EphemeralReply([errorContainer("Esta não é a sua mesa — use `/cassino` para abrir a sua.")])
    );
    return;
  }

  const userId = ownerId;

  if (action === "roleta") {
    await interaction.update(renderRoleta(userId) as never);
    return;
  }

  if (action === "aviator") {
    await interaction.update(renderAviator(userId) as never);
    registerAviatorMessage(userId, interaction.message as Message);
    ensureAviatorLoop(userId);
    return;
  }

  if (action === "depositar") {
    const modal = new ModalBuilder().setCustomId(`cassino:depositar_submit:_:${userId}`).setTitle("Depositar");
    const input = new TextInputBuilder()
      .setCustomId("valor")
      .setLabel("Quanto quer depositar na banca")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10)
      .setPlaceholder("Ex: 100");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (action === "rodada") {
    const modal = new ModalBuilder().setCustomId(`cassino:rodada_submit:_:${userId}`).setTitle("Configurar Rodada");
    const input = new TextInputBuilder()
      .setCustomId("valor")
      .setLabel("Quantas fichas por rodada")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10)
      .setPlaceholder("Ex: 10");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (action === "girar") {
    const modal = new ModalBuilder().setCustomId(`cassino:girar_submit:_:${userId}`).setTitle("Girar a Roleta");
    const corInput = new TextInputBuilder()
      .setCustomId("cor")
      .setLabel("Sua cor (branco ou preto)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(6)
      .setPlaceholder("branco ou preto");
    const numeroInput = new TextInputBuilder()
      .setCustomId("numero")
      .setLabel(`Seu número da sorte (1 a ${ROLETA_NUMEROS})`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(2)
      .setPlaceholder("Ex: 7");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(corInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(numeroInput)
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "sacar") {
    const modal = new ModalBuilder().setCustomId(`cassino:sacar_submit:_:${userId}`).setTitle("Sacar da Banca");
    const input = new TextInputBuilder()
      .setCustomId("valor")
      .setLabel("Quanto sacar da banca")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10)
      .setPlaceholder("Ex: 100");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (action === "sair") {
    const result = sairCassino(userId);
    await interaction.update(renderCassinoHome(userId) as never);
    const msg =
      result.returned > 0
        ? `Você saiu da mesa e recebeu de volta **${fmt(result.returned)} fichas** na carteira.`
        : "Você saiu da mesa.";
    await toast(interaction, msg, true);
    return;
  }
}

export async function handleCassinoModal(interaction: ModalSubmitInteraction, action: string, args: string[]) {
  // customId: cassino:<action>:_:<ownerId>
  const userId = args[1];
  if (!userId) return;
  if (interaction.user.id !== userId) {
    await interaction.reply(
      v2EphemeralReply([errorContainer("Esta não é a sua mesa — use `/cassino` para abrir a sua.")])
    );
    return;
  }

  if (action === "depositar_submit") {
    const raw = interaction.fields.getTextInputValue("valor");
    const valor = parseAmount(raw);

    if (valor === null) {
      await interaction.reply(v2EphemeralReply([errorContainer("Valor inválido. Digite um número válido.")]));
      return;
    }

    const result = depositarCassino(userId, valor);
    await interaction.update(renderRoleta(userId) as never);

    if (!result.ok) {
      const reason =
        result.reason === "locked"
          ? "Sua conta está bloqueada. Pague suas dívidas em `/banco` antes de apostar."
          : result.reason === "insufficient"
            ? "Você não tem fichas suficientes para esse depósito."
            : "Valor inválido.";
      await toast(interaction, reason, false);
      return;
    }

    await toast(
      interaction,
      `Você depositou **${fmt(result.added)} fichas** na banca. Valor por rodada: **${fmt(result.betPerRound)} fichas**.`,
      true
    );
    return;
  }

  if (action === "rodada_submit") {
    const raw = interaction.fields.getTextInputValue("valor");
    const valor = parseAmount(raw);

    if (valor === null) {
      await interaction.reply(v2EphemeralReply([errorContainer("Valor inválido. Digite um número válido.")]));
      return;
    }

    const result = configurarRodada(userId, valor);
    await interaction.update(renderRoleta(userId) as never);

    if (!result.ok) {
      const reason =
        result.reason === "locked"
          ? "Sua conta está bloqueada. Pague suas dívidas em `/banco` antes de jogar."
          : "Valor inválido.";
      await toast(interaction, reason, false);
      return;
    }

    await toast(interaction, `Valor por rodada definido para **${fmt(result.betPerRound)} fichas**.`, true);
    return;
  }

  if (action === "girar_submit") {
    const corRaw = interaction.fields.getTextInputValue("cor");
    const numeroRaw = interaction.fields.getTextInputValue("numero");
    const cor = parseCor(corRaw);
    const numero = parseNumero(numeroRaw);

    if (!cor || numero === null) {
      await interaction.reply(
        v2EphemeralReply([
          errorContainer(`Dados inválidos. Cor: "branco" ou "preto". Número: 1 a ${ROLETA_NUMEROS}.`),
        ])
      );
      return;
    }

    const result = girarRoleta(userId, cor, numero);
    await interaction.update(renderRoleta(userId) as never);

    if (!result.ok) {
      const reason =
        result.reason === "locked"
          ? "Sua conta está bloqueada. Pague suas dívidas em `/banco` antes de jogar."
          : result.reason === "no_bet"
            ? "Deposite fichas na banca (**Depositar**) e garanta que ela cubra o valor por rodada (ajustável em **Rodada**)."
            : "Dados inválidos.";
      await toast(interaction, reason, false);
      return;
    }

    // O resultado (ganhou/perdeu) já aparece direto no painel — sem mensagem extra aqui.
    return;
  }

  if (action === "sacar_submit") {
    const raw = interaction.fields.getTextInputValue("valor");
    const valor = parseAmount(raw);

    if (valor === null) {
      await interaction.reply(v2EphemeralReply([errorContainer("Valor inválido. Digite um número válido.")]));
      return;
    }

    const result = sacarCassino(userId, valor);
    await interaction.update(renderRoleta(userId) as never);

    if (!result.ok) {
      await toast(interaction, "Valor inválido — verifique se ele não passa do que está na banca.", false);
      return;
    }

    await toast(
      interaction,
      `Você sacou **${fmt(result.amount)} fichas** para a carteira. Banca restante: **${fmt(result.banca)} fichas**.`,
      true
    );
    return;
  }
}
