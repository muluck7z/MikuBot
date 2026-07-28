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
  sacarAviator,
  iniciarVooAviator,
  crasharAviator,
  reiniciarRodadaAviator,
  multiplicadorAtualAviator,
  AVIATOR_BETTING_SECONDS,
  AVIATOR_CRASH_PAUSE_MS,
  type ApostarAviatorResult,
  type DepositarAviatorResult,
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

// ─── Registro das mensagens ao vivo (uma por usuário que abriu o painel) ────────

const aviatorMessages = new Map<string, Map<string, Message>>(); // channelId -> (userId -> Message)
const aviatorIntervals = new Map<string, NodeJS.Timeout>(); // channelId -> tick ativo (apostas ou voo)
const aviatorTimeouts = new Map<string, NodeJS.Timeout>(); // channelId -> pausa pós-crash

export function registerAviatorMessage(channelId: string, userId: string, message: Message) {
  let map = aviatorMessages.get(channelId);
  if (!map) {
    map = new Map();
    aviatorMessages.set(channelId, map);
  }
  map.set(userId, message);
}

function unregisterAviatorMessage(channelId: string, userId: string) {
  aviatorMessages.get(channelId)?.delete(userId);
}

async function broadcastAviator(channelId: string, exceptMessageId?: string) {
  const map = aviatorMessages.get(channelId);
  if (!map) return;
  for (const [userId, message] of map) {
    if (message.id === exceptMessageId) continue;
    try {
      await message.edit(renderAviator(channelId, userId) as never);
    } catch {
      map.delete(userId);
    }
  }
}

function clearAviatorInterval(channelId: string) {
  const existing = aviatorIntervals.get(channelId);
  if (existing) {
    clearInterval(existing);
    aviatorIntervals.delete(channelId);
  }
}

// ─── Loops (apostas → voo → crash → idle) ──────────────────────────────────────

function startBettingLoop(channelId: string) {
  clearAviatorInterval(channelId);
  const interval = setInterval(async () => {
    const room = getAviatorRoom(channelId);
    if (room.phase !== "betting") {
      clearAviatorInterval(channelId);
      return;
    }
    const remaining = AVIATOR_BETTING_SECONDS - (Date.now() - room.phaseStartedAt) / 1000;
    if (remaining <= 0) {
      clearAviatorInterval(channelId);
      iniciarVooAviator(channelId);
      await broadcastAviator(channelId);
      startFlightLoop(channelId);
      return;
    }
    await broadcastAviator(channelId);
  }, 1000);
  aviatorIntervals.set(channelId, interval);
}

function startFlightLoop(channelId: string) {
  clearAviatorInterval(channelId);
  const interval = setInterval(async () => {
    const room = getAviatorRoom(channelId);
    if (room.phase !== "flying") {
      clearAviatorInterval(channelId);
      return;
    }
    const m = multiplicadorAtualAviator(channelId);
    if (room.crashPoint !== null && m >= room.crashPoint) {
      clearAviatorInterval(channelId);
      crasharAviator(channelId);
      await broadcastAviator(channelId);
      const timeout = setTimeout(async () => {
        reiniciarRodadaAviator(channelId);
        await broadcastAviator(channelId);
      }, AVIATOR_CRASH_PAUSE_MS);
      aviatorTimeouts.set(channelId, timeout);
      return;
    }
    await broadcastAviator(channelId);
  }, 1000);
  aviatorIntervals.set(channelId, interval);
}

/** Garante que a sala do canal esteja com o loop certo rodando (chamado ao abrir o painel). */
export function ensureAviatorLoop(channelId: string) {
  const room = getAviatorRoom(channelId);
  if (aviatorIntervals.has(channelId)) return;
  if (room.phase === "betting") startBettingLoop(channelId);
  if (room.phase === "flying") startFlightLoop(channelId);
}

// ─── Mensagens de erro ──────────────────────────────────────────────────────────

type ApostarAviatorReason = Extract<ApostarAviatorResult, { ok: false }>["reason"];
type DepositarAviatorReason = Extract<DepositarAviatorResult, { ok: false }>["reason"];

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

// ─── Botões ──────────────────────────────────────────────────────────────────────

export async function handleAviatorButton(interaction: ButtonInteraction, parts: string[]) {
  // customId: aviator:<action>:_:<channelId>
  const [, action, , channelId] = parts;
  if (!channelId) return;
  const userId = interaction.user.id;

  if (action === "apostar") {
    const modal = new ModalBuilder()
      .setCustomId(`aviator:apostar_submit:_:${channelId}`)
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
      .setCustomId(`aviator:depositar_submit:_:${channelId}`)
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

  if (action === "sacar") {
    await interaction.deferUpdate();
    const result = sacarAviator(channelId, userId);

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

    await broadcastAviator(channelId);
    await toast(
      interaction,
      `Você sacou em **${result.multiplier.toFixed(2)}x** e ganhou **${fmt(result.won)} fichas**!`,
      true
    );
    return;
  }

  if (action === "resultados") {
    unregisterAviatorMessage(channelId, userId);
    await interaction.update(renderAviatorResultados(channelId) as never);
    return;
  }

  if (action === "fechar_resultados") {
    await interaction.update(renderAviator(channelId, userId) as never);
    registerAviatorMessage(channelId, userId, interaction.message as Message);
    return;
  }

  if (action === "voltar" || action === "sair") {
    unregisterAviatorMessage(channelId, userId);
    await interaction.update(renderCassinoHome(userId) as never);
    return;
  }
}

// ─── Modais ──────────────────────────────────────────────────────────────────────

export async function handleAviatorModal(interaction: ModalSubmitInteraction, action: string, args: string[]) {
  // customId: aviator:<action>:_:<channelId>
  const channelId = args[1];
  if (!channelId) return;
  const userId = interaction.user.id;

  if (action === "apostar_submit") {
    const raw = interaction.fields.getTextInputValue("valor");
    const valor = parseAmount(raw);

    if (valor === null) {
      await interaction.reply(v2EphemeralReply([errorContainer("Valor inválido. Digite um número válido.")]));
      return;
    }

    const wasIdle = getAviatorRoom(channelId).phase === "idle";
    const result = apostarAviator(channelId, userId, valor);

    if (!result.ok) {
      await interaction.reply(v2EphemeralReply([errorContainer(apostarErrorMsg(result.reason))]));
      return;
    }

    if (wasIdle) startBettingLoop(channelId);

    await interaction.update(renderAviator(channelId, userId) as never);
    if (interaction.message) {
      registerAviatorMessage(channelId, userId, interaction.message as Message);
    }
    await broadcastAviator(channelId, interaction.message?.id);
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

    await interaction.update(renderAviator(channelId, userId) as never);
    return;
  }
}
