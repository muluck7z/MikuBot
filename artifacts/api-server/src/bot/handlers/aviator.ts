import {
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type Message,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
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

// ─── Registro dos cartões ao vivo (um por participante, nunca compartilhado) ───

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

/** De quem é o cartão que essa mensagem representa (se for de alguém rastreado). */
function findCardOwner(channelId: string, messageId: string): string | undefined {
  const map = aviatorMessages.get(channelId);
  if (!map) return undefined;
  for (const [uid, msg] of map) {
    if (msg.id === messageId) return uid;
  }
  return undefined;
}

/**
 * Mostra o painel do Aviator sempre no cartão de quem clicou — NUNCA no cartão de
 * outra pessoa, mesmo que a pessoa tenha clicado num botão que estava no cartão de
 * outra pessoa (o mais comum: apostar clicando no painel que outro jogador abriu).
 * Isso evita várias pessoas ficando "grudadas" na mesma mensagem, o que sobrecarrega
 * as edições por segundo e trava o painel de todo mundo.
 */
async function presentOwnCard(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  channelId: string,
  userId: string
) {
  const clickedMessageId = interaction.message?.id;
  const owner = clickedMessageId ? findCardOwner(channelId, clickedMessageId) : undefined;

  if (!owner || owner === userId) {
    // Mensagem livre (ninguém rastreado nela ainda) ou já é o próprio cartão da
    // pessoa — pode editar direto.
    await interaction.update(renderAviator(channelId, userId) as never);
    if (interaction.message) registerAviatorMessage(channelId, userId, interaction.message as Message);
    return;
  }

  // É o cartão de outra pessoa — não mexe nele. Atualiza (ou cria) o cartão
  // separado de quem clicou, sem tocar na mensagem alheia.
  await interaction.deferUpdate();

  const map = aviatorMessages.get(channelId);
  const existing = map?.get(userId);
  if (existing) {
    try {
      await existing.edit(renderAviator(channelId, userId) as never);
      return;
    } catch {
      map?.delete(userId);
    }
  }

  const msg = await interaction.followUp(renderAviator(channelId, userId) as never);
  registerAviatorMessage(channelId, userId, msg as Message);
}

async function broadcastAviator(channelId: string, exceptMessageId?: string) {
  const map = aviatorMessages.get(channelId);
  if (!map) return;

  const entries = [...map.entries()].filter(([, message]) => message.id !== exceptMessageId);

  // Edita todos os cartões em paralelo — com o loop sequencial de antes, cada
  // participante a mais somava tempo de espera ao tick inteiro (e, se o tick
  // demorasse mais que 1s, o próximo já disparava em cima, empilhando ticks).
  await Promise.all(
    entries.map(async ([userId, message]) => {
      try {
        await message.edit(renderAviator(channelId, userId) as never);
      } catch (err: unknown) {
        // Só tira do lobby se a mensagem realmente não existir mais (apagada
        // pelo usuário/mod, ou o bot perdeu acesso ao canal). Qualquer outra
        // falha (rate limit, hiccup de rede, etc.) é passageira — mantém a
        // pessoa registrada, o próximo tick tenta editar de novo normalmente.
        const code = (err as { code?: number; rawError?: { code?: number } } | undefined)?.code
          ?? (err as { rawError?: { code?: number } } | undefined)?.rawError?.code;
        const isGone = code === 10008 /* Unknown Message */ || code === 10003 /* Unknown Channel */;
        if (isGone) {
          map.delete(userId);
        }
      }
    })
  );
}

function clearAviatorInterval(channelId: string) {
  const existing = aviatorIntervals.get(channelId);
  if (existing) {
    clearTimeout(existing);
    aviatorIntervals.delete(channelId);
  }
}

// ─── Loops (apostas → voo → crash → idle) ──────────────────────────────────────
//
// Importante: usamos setTimeout que se reagenda a si mesmo (não setInterval).
// setInterval dispara no relógio, sem esperar o tick anterior terminar — se um
// tick demorasse mais que 1s (ex: muita gente na sala), o próximo já disparava
// em cima, os ticks se acumulavam e travava tudo. Com o reagendamento manual,
// só existe um tick rodando por vez, sempre.

function startBettingLoop(channelId: string) {
  clearAviatorInterval(channelId);

  const tick = async () => {
    const room = getAviatorRoom(channelId);
    if (room.phase !== "betting") {
      aviatorIntervals.delete(channelId);
      return;
    }

    const remaining = AVIATOR_BETTING_SECONDS - (Date.now() - room.phaseStartedAt) / 1000;
    if (remaining <= 0) {
      aviatorIntervals.delete(channelId);
      iniciarVooAviator(channelId);
      await broadcastAviator(channelId);
      startFlightLoop(channelId);
      return;
    }

    await broadcastAviator(channelId);
    aviatorIntervals.set(channelId, setTimeout(tick, 1000));
  };

  aviatorIntervals.set(channelId, setTimeout(tick, 1000));
}

function startFlightLoop(channelId: string) {
  clearAviatorInterval(channelId);

  const tick = async () => {
    const room = getAviatorRoom(channelId);
    if (room.phase !== "flying") {
      aviatorIntervals.delete(channelId);
      return;
    }

    const m = multiplicadorAtualAviator(channelId);
    if (room.crashPoint !== null && m >= room.crashPoint) {
      aviatorIntervals.delete(channelId);
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
    aviatorIntervals.set(channelId, setTimeout(tick, 1000));
  };

  aviatorIntervals.set(channelId, setTimeout(tick, 1000));
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
type SacarBancaAviatorReason = Extract<SacarBancaAviatorResult, { ok: false }>["reason"];

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
  // customId: aviator:<action>:_:<channelId>
  const [, action, , channelId] = parts;
  if (!channelId) return;
  const userId = interaction.user.id;

  if (action === "assistir") {
    // Cria/atualiza só o cartão de quem clicou — nunca mexe no cartão alheio.
    await presentOwnCard(interaction, channelId, userId);
    ensureAviatorLoop(channelId);
    return;
  }

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

  if (action === "sacar_banca") {
    const modal = new ModalBuilder()
      .setCustomId(`aviator:sacar_banca_submit:_:${channelId}`)
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
    // Saque da aposta em voo — nunca mexe visualmente no cartão clicado, só
    // confirma por toast e deixa o broadcast atualizar o cartão de cada um.
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
    const clickedMessageId = interaction.message?.id;
    const owner = clickedMessageId ? findCardOwner(channelId, clickedMessageId) : undefined;

    if (!owner || owner === userId) {
      unregisterAviatorMessage(channelId, userId);
      await interaction.update(renderAviatorResultados(channelId) as never);
      return;
    }

    // Cartão de outra pessoa — mostra os resultados só pra quem clicou, sem
    // mexer no painel ao vivo alheio.
    const payload = renderAviatorResultados(channelId);
    await interaction.reply({ ...payload, flags: (payload.flags as number) | MessageFlags.Ephemeral } as never);
    return;
  }

  if (action === "fechar_resultados") {
    await presentOwnCard(interaction, channelId, userId);
    return;
  }

  if (action === "voltar" || action === "sair") {
    const clickedMessageId = interaction.message?.id;
    const owner = clickedMessageId ? findCardOwner(channelId, clickedMessageId) : undefined;

    if (!owner || owner === userId) {
      unregisterAviatorMessage(channelId, userId);
      await interaction.update(renderCassinoHome(userId) as never);
      return;
    }

    // Cartão de outra pessoa — não mexe nele, só some com o cartão da pessoa
    // que clicou (se ela tinha um) e leva ela de volta pro menu, ephemeral.
    unregisterAviatorMessage(channelId, userId);
    const payload = renderCassinoHome(userId);
    await interaction.reply({ ...payload, flags: (payload.flags as number) | MessageFlags.Ephemeral } as never);
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

    await presentOwnCard(interaction, channelId, userId);
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

    await presentOwnCard(interaction, channelId, userId);
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

    await presentOwnCard(interaction, channelId, userId);
    return;
  }
}
