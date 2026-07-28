import {
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type Message,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import { errorContainer, successContainer, v2EphemeralReply } from "../v2/index";
import { renderAviator, renderAviatorResultados, renderCassinoHome } from "../cassinoViews";
import {
  getAviatorRoom,
  apostarAviator,
  depositarAviator,
  sacarBancaAviator,
  sacarAviator,
  iniciarVooAviator,
  crasharAviator,
  reiniciarRodadaAviator,
  multiplicadorAtualAviator,
  AVIATOR_BETTING_SECONDS,
  AVIATOR_CRASH_PAUSE_MS,
  type ApostarAviatorResult,
  type DepositarAviatorResult,
  type SacarBancaAviatorResult,
} from "../economyStore";

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

async function toast(interaction: ButtonInteraction | ModalSubmitInteraction, description: string, ok: boolean) {
  await interaction.followUp(
    v2EphemeralReply([ok ? successContainer("Sucesso!", description) : errorContainer(description)])
  );
}

// ─── Registro do cartão ao vivo de cada usuário (individual, nunca compartilhado) ───
//
// Igual à Roleta: cada usuário tem sua própria sala/rodada. O painel do Aviator
// só é editado no cartão de quem é dono dele — ninguém mais consegue mexer nem
// ver o painel de outra pessoa sendo atualizado.

const aviatorMessages = new Map<string, Message>(); // userId -> cartão ao vivo dele
const aviatorIntervals = new Map<string, NodeJS.Timeout>(); // userId -> tick ativo (apostas ou voo)
const aviatorTimeouts = new Map<string, NodeJS.Timeout>(); // userId -> pausa pós-crash

export function registerAviatorMessage(userId: string, message: Message) {
  aviatorMessages.set(userId, message);
}

function unregisterAviatorMessage(userId: string) {
  aviatorMessages.delete(userId);
}

async function updateAviatorCard(userId: string) {
  const message = aviatorMessages.get(userId);
  if (!message) return;

  try {
    await message.edit(renderAviator(userId) as never);
  } catch (err: unknown) {
    // Só tira do registro se a mensagem realmente não existir mais (apagada
    // pelo usuário/mod, ou o bot perdeu acesso ao canal). Qualquer outra falha
    // (rate limit, hiccup de rede, etc.) é passageira — o próximo tick tenta de novo.
    const code = (err as { code?: number; rawError?: { code?: number } } | undefined)?.code
      ?? (err as { rawError?: { code?: number } } | undefined)?.rawError?.code;
    const isGone = code === 10008 /* Unknown Message */ || code === 10003 /* Unknown Channel */;
    if (isGone) {
      aviatorMessages.delete(userId);
    }
  }
}

function clearAviatorInterval(userId: string) {
  const existing = aviatorIntervals.get(userId);
  if (existing) {
    clearTimeout(existing);
    aviatorIntervals.delete(userId);
  }
}

// ─── Loops individuais (apostas → voo → crash → idle) ──────────────────────────
//
// Cada usuário tem seu próprio loop, isolado do de qualquer outro. Usamos
// setTimeout que se reagenda a si mesmo (não setInterval), então mesmo com
// muita gente jogando ao mesmo tempo, um tick lento de um usuário nunca
// atrasa ou trava o painel de outro.

function startBettingLoop(userId: string) {
  clearAviatorInterval(userId);

  const tick = async () => {
    const room = getAviatorRoom(userId);
    if (room.phase !== "betting") {
      aviatorIntervals.delete(userId);
      return;
    }

    const remaining = AVIATOR_BETTING_SECONDS - (Date.now() - room.phaseStartedAt) / 1000;
    if (remaining <= 0) {
      aviatorIntervals.delete(userId);
      iniciarVooAviator(userId);
      await updateAviatorCard(userId);
      startFlightLoop(userId);
      return;
    }

    await updateAviatorCard(userId);
    aviatorIntervals.set(userId, setTimeout(tick, 1000));
  };

  aviatorIntervals.set(userId, setTimeout(tick, 1000));
}

function startFlightLoop(userId: string) {
  clearAviatorInterval(userId);

  const tick = async () => {
    const room = getAviatorRoom(userId);
    if (room.phase !== "flying") {
      aviatorIntervals.delete(userId);
      return;
    }

    const m = multiplicadorAtualAviator(userId);
    if (room.crashPoint !== null && m >= room.crashPoint) {
      aviatorIntervals.delete(userId);
      crasharAviator(userId);
      await updateAviatorCard(userId);
      const timeout = setTimeout(async () => {
        reiniciarRodadaAviator(userId);
        await updateAviatorCard(userId);
      }, AVIATOR_CRASH_PAUSE_MS);
      aviatorTimeouts.set(userId, timeout);
      return;
    }

    await updateAviatorCard(userId);
    aviatorIntervals.set(userId, setTimeout(tick, 1000));
  };

  aviatorIntervals.set(userId, setTimeout(tick, 1000));
}

/** Garante que a sala do usuário esteja com o loop certo rodando (chamado ao abrir o painel). */
export function ensureAviatorLoop(userId: string) {
  const room = getAviatorRoom(userId);
  if (aviatorIntervals.has(userId)) return;
  if (room.phase === "betting") startBettingLoop(userId);
  if (room.phase === "flying") startFlightLoop(userId);
}

// ─── Mensagens de erro ──────────────────────────────────────────────────────────

type ApostarAviatorReason = Exclude<ApostarAviatorResult, { ok: true }>["reason"];
type DepositarAviatorReason = Exclude<DepositarAviatorResult, { ok: true }>["reason"];
type SacarBancaAviatorReason = Exclude<SacarBancaAviatorResult, { ok: true }>["reason"];

function apostarErrorMsg(reason: ApostarAviatorReason): string {
  switch (reason) {
    case "locked":
      return "Sua conta está bloqueada. Pague suas dívidas em `/banco` antes de apostar.";
    case "already_bet":
      return "Você já apostou nessa rodada — espere a próxima.";
    case "insufficient":
      return "Você não tem fichas suficientes na banca do Aviator para essa aposta. Deposite mais.";
    case "wrong_phase":
      return "A rodada já decolou — espere a próxima começar.";
    default:
      return "Valor inválido.";
  }
}

function depositarErrorMsg(reason: DepositarAviatorReason): string {
  switch (reason) {
    case "locked":
      return "Sua conta está bloqueada. Pague suas dívidas em `/banco` antes de depositar.";
    case "insufficient":
      return "Você não tem fichas suficientes para esse depósito.";
    default:
      return "Valor inválido.";
  }
}

function sacarBancaErrorMsg(_reason: SacarBancaAviatorReason): string {
  return "Valor inválido — confira se não passa do que você tem na banca do Aviator.";
}

// ─── Botões ──────────────────────────────────────────────────────────────────────

export async function handleAviatorButton(interaction: ButtonInteraction, parts: string[]) {
  // customId: aviator:<action>:_:<ownerId>
  const [, action, , ownerId] = parts;
  if (!ownerId) return;

  if (interaction.user.id !== ownerId) {
    await interaction.reply(
      v2EphemeralReply([errorContainer("Este painel não é seu — use `/cassino` para abrir o seu.")])
    );
    return;
  }

  const userId = ownerId;

  if (action === "assistir") {
    await interaction.update(renderAviator(userId) as never);
    if (interaction.message) registerAviatorMessage(userId, interaction.message as Message);
    ensureAviatorLoop(userId);
    return;
  }

  if (action === "apostar") {
    const modal = new ModalBuilder()
      .setCustomId(`aviator:apostar_submit:_:${userId}`)
      .setTitle("Apostar no Aviator");
    const input = new TextInputBuilder()
      .setCustomId("valor")
      .setLabel("Quanto apostar nessa rodada")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10)
      .setPlaceholder("Ex: 50");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (action === "depositar") {
    const modal = new ModalBuilder()
      .setCustomId(`aviator:depositar_submit:_:${userId}`)
      .setTitle("Depositar no Aviator");
    const input = new TextInputBuilder()
      .setCustomId("valor")
      .setLabel("Quanto depositar na banca do Aviator")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10)
      .setPlaceholder("Ex: 100");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (action === "sacar_banca") {
    const modal = new ModalBuilder()
      .setCustomId(`aviator:sacar_banca_submit:_:${userId}`)
      .setTitle("Sacar da banca do Aviator");
    const input = new TextInputBuilder()
      .setCustomId("valor")
      .setLabel("Quanto sacar da banca pra carteira")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10)
      .setPlaceholder("Ex: 100");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (action === "sacar") {
    // Saque da aposta em voo — confirma por toast e atualiza o próprio cartão.
    await interaction.deferUpdate();
    const result = sacarAviator(userId);

    if (!result.ok) {
      const reason =
        result.reason === "no_bet"
          ? "Você não apostou nessa rodada."
          : result.reason === "already_cashed"
            ? "Você já sacou nessa rodada."
            : "A rodada já explodiu — não deu tempo de sacar.";
      await toast(interaction, reason, false);
      return;
    }

    await updateAviatorCard(userId);
    await toast(
      interaction,
      `Você sacou em **${result.multiplier.toFixed(2)}x** e ganhou **${fmt(result.won)} fichas**!`,
      true
    );
    return;
  }

  if (action === "resultados") {
    await interaction.update(renderAviatorResultados(userId) as never);
    return;
  }

  if (action === "fechar_resultados") {
    await interaction.update(renderAviator(userId) as never);
    if (interaction.message) registerAviatorMessage(userId, interaction.message as Message);
    ensureAviatorLoop(userId);
    return;
  }

  if (action === "voltar" || action === "sair") {
    unregisterAviatorMessage(userId);
    await interaction.update(renderCassinoHome(userId) as never);
    return;
  }
}

// ─── Modais ──────────────────────────────────────────────────────────────────────

export async function handleAviatorModal(interaction: ModalSubmitInteraction, action: string, args: string[]) {
  // customId: aviator:<action>:_:<ownerId>
  const ownerId = args[1];
  if (!ownerId) return;

  if (interaction.user.id !== ownerId) {
    await interaction.reply(
      v2EphemeralReply([errorContainer("Este painel não é seu — use `/cassino` para abrir o seu.")])
    );
    return;
  }

  const userId = ownerId;

  if (action === "apostar_submit") {
    const raw = interaction.fields.getTextInputValue("valor");
    const valor = parseAmount(raw);

    if (valor === null) {
      await interaction.reply(v2EphemeralReply([errorContainer("Valor inválido. Digite um número válido.")]));
      return;
    }

    const wasIdle = getAviatorRoom(userId).phase === "idle";
    const result = apostarAviator(userId, valor);

    if (!result.ok) {
      await interaction.reply(v2EphemeralReply([errorContainer(apostarErrorMsg(result.reason))]));
      return;
    }

    if (wasIdle) startBettingLoop(userId);

    await interaction.update(renderAviator(userId) as never);
    if (interaction.message) registerAviatorMessage(userId, interaction.message as Message);
    return;
  }

  if (action === "depositar_submit") {
    const raw = interaction.fields.getTextInputValue("valor");
    const valor = parseAmount(raw);

    if (valor === null) {
      await interaction.reply(v2EphemeralReply([errorContainer("Valor inválido. Digite um número válido.")]));
      return;
    }

    const result = depositarAviator(userId, valor);

    if (!result.ok) {
      await interaction.reply(v2EphemeralReply([errorContainer(depositarErrorMsg(result.reason))]));
      return;
    }

    await interaction.update(renderAviator(userId) as never);
    if (interaction.message) registerAviatorMessage(userId, interaction.message as Message);
    return;
  }

  if (action === "sacar_banca_submit") {
    const raw = interaction.fields.getTextInputValue("valor");
    const valor = parseAmount(raw);

    if (valor === null) {
      await interaction.reply(v2EphemeralReply([errorContainer("Valor inválido. Digite um número válido.")]));
      return;
    }

    const result = sacarBancaAviator(userId, valor);

    if (!result.ok) {
      await interaction.reply(v2EphemeralReply([errorContainer(sacarBancaErrorMsg(result.reason))]));
      return;
    }

    await interaction.update(renderAviator(userId) as never);
    if (interaction.message) registerAviatorMessage(userId, interaction.message as Message);
    return;
  }
}
