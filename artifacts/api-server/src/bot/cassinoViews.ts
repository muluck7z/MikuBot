import { infoContainer, secondaryButton, row, MessageFlags } from "./v2/index";
import {
  processAccount,
  ROLETA_NUMEROS,
  getAviatorRoom,
  multiplicadorAtualAviator,
  AVIATOR_BETTING_SECONDS,
  type AviatorRoomState,
} from "./economyStore";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

// ─── Emojis customizados ────────────────────────────────────────────────────────
const E = {
  parceria: "<:parceria:1531111024369995868>",
  suporte: "<:suporte:1531074502790873171>",
  announce: "<:ticket_announce:1530817537007161374>",
  ticketUser: "<:ticket_user:1530817417842921492>",
  ticket: "<:ticket:1508274275730063360>",
  em: "<:em:1531074006978138292>",
  comunidade2: "<:comunidade2:1531072981688914103>",
  carregando: "<a:a_carregandogifs:1530818101980037120>",
  arrowright: "<a:w_arrowright5:1531492242571788368>",
  alerta: "<a:alerta_pfbcr:1531496411160645686>",
  anuncio: "<:anncio:1530818189523554335>",
};

// TODO: ainda não temos o arquivo da logo Brazino 777 salvo no repositório —
// assim que o Henrique enviar a imagem (upload de arquivo, não só visualização
// no chat), troque isto por uma URL hospedada, ou pelo padrão
// "attachment://brazino777.png" anexando o arquivo local nas respostas.
const THUMBNAIL_URL: string | undefined = undefined;

/** Monta o customId de um botão do cassino, sempre com o dono embutido no final. */
function cid(action: string, userId: string, arg?: string | number): string {
  return `cassino:${action}:${arg ?? "_"}:${userId}`;
}

function screen(container: ReturnType<typeof infoContainer>, ...rows: ReturnType<typeof row>[]) {
  return {
    components: [container, ...rows],
    files: [] as unknown[],
    flags: MessageFlags.IsComponentsV2,
  };
}

// ─── Dashboard principal ────────────────────────────────────────────────────────

export function renderCassinoHome(userId: string) {
  const container = infoContainer({
    title: `${E.parceria} Cassino Brazino 777`,
    description: [
      "Chega ae que aqui é a Brazino! O melhor cassino existente! Aqui você pode apostar com segurança e qualidade. Está esperando o que? Venha para a Brazino agora mesmo!",
    ].join("\n"),
    avatarUrl: THUMBNAIL_URL,
  });

  const buttons = row(
    secondaryButton(cid("roleta", userId), "Roleta"),
    secondaryButton(cid("aviator", userId), "Aviator")
  );

  return screen(container, buttons);
}

// ─── Roleta ──────────────────────────────────────────────────────────────────────

export function renderRoleta(userId: string) {
  const user = processAccount(userId);
  const cassino = user.cassino;

  let lines: string[];

  if (cassino.banca > 0) {
    // Já depositou — painel enxuto, visível para todo mundo.
    lines = [
      `${E.ticketUser} Banca: ${fmt(cassino.banca)} fichas`,
      `${E.ticket} Valor por rodada: ${fmt(cassino.betPerRound)} fichas`,
    ];

    if (cassino.lastResult) {
      const { cor, numero, won, amount, debtAdded } = cassino.lastResult;
      const verbo = won ? "ganhou" : "perdeu";
      lines.push("");
      lines.push(`${E.announce} (${cor};${numero}), você ${verbo} ${fmt(amount)} fichas`);
      if (debtAdded && debtAdded > 0) {
        lines.push(`⚠️ Isso gerou uma dívida de ${fmt(debtAdded)} fichas em seu nome.`);
      }
    }
  } else {
    // Ainda não depositou — mostra a explicação completa do jogo.
    lines = [
      `${E.announce}`,
      "* O jogo funciona da seguinte forma:",
      `  * A roleta consiste em números de 1 a ${ROLETA_NUMEROS} (brancos) e (pretos), você deve escolher uma cor e um número da sorte; se sua cor for onde a bola parou mas não em cima do seu número da sorte, você ganha o dobro do que apostou mas, se for o contrário você perde o valor que apostou; se sua cor for onde a bola parou e o número for vizinho (o anterior ou o seguinte) do seu número da sorte, o valor que você apostou é multiplicado por 10 mas, se for o contrário (a cor oposta e o número vizinho), o valor apostado é multiplicado por 10 e descontado da sua banca, e caso a banca não consiga tancar, pegamos o valor que estiver no seu banco e, se não tiver saldo suficiente, vira dívida na sua carteira; se fosse sua cor e o número da sorte que tivesse caído, o valor que você apostou seria multiplicado por 100 mas, se fosse o contrário a cor oposta e o mesmo número da sorte, o valor que você apostou seria multiplicado por 100 e descontado da sua banca, e caso a sua banca não consiga tancar esse valor, pegamos o valor que estiver no seu banco mas, se não tiver saldo suficiente em seu banco vira dívida em seu nome.`,
      "",
      `${E.ticketUser} Banca: ${fmt(cassino.banca)} fichas`,
      `${E.ticket} Valor por rodada: ${fmt(cassino.betPerRound)} fichas`,
      `${E.em} **Saldo na carteira:** ${fmt(user.fichas)} fichas`,
    ];
  }

  const container = infoContainer({
    title: `${E.suporte} Brazino - Roleta`,
    description: lines.join("\n"),
    avatarUrl: THUMBNAIL_URL,
  });

  const buttons = row(
    secondaryButton(cid("depositar", userId), "Depositar"),
    secondaryButton(cid("rodada", userId), "Rodada"),
    secondaryButton(cid("girar", userId), "Girar").setDisabled(
      cassino.betPerRound <= 0 || cassino.banca < cassino.betPerRound
    ),
    secondaryButton(cid("sacar", userId), "Sacar").setDisabled(cassino.banca <= 0),
    secondaryButton(cid("sair", userId), "Sair")
  );

  return screen(container, buttons);
}

// ─── Aviator ─────────────────────────────────────────────────────────────────────

function fmtMult(m: number): string {
  return `${m.toFixed(2)}x`;
}

/** customId de um botão do Aviator — não embute dono, a mesa é compartilhada pelo canal. */
function acid(action: string, channelId: string): string {
  return `aviator:${action}:_:${channelId}`;
}

export function renderAviatorResultados(channelId: string) {
  const room = getAviatorRoom(channelId);

  const lines =
    room.crashHistory.length > 0
      ? [room.crashHistory.map((c) => fmtMult(c)).join(" · ")]
      : ["Nenhuma rodada registrada ainda neste canal."];

  const container = infoContainer({
    title: `${E.comunidade2} Aviator — Resultados`,
    description: [`${E.anuncio} **Últimas ${room.crashHistory.length} rodadas:**`, "", ...lines].join("\n"),
    avatarUrl: THUMBNAIL_URL,
  });

  const buttons = row(secondaryButton(acid("fechar_resultados", channelId), "Voltar"));
  return screen(container, buttons);
}

/** Painel compartilhado do Aviator — `viewerUserId` só personaliza banca/valor inicial exibidos. */
export function renderAviator(channelId: string, viewerUserId: string) {
  const room = getAviatorRoom(channelId);
  const viewer = processAccount(viewerUserId);

  if (room.phase === "idle") {
    return renderAviatorIdle(room, viewer.aviator.banca);
  }
  if (room.phase === "betting") {
    return renderAviatorBetting(room, viewer.aviator.banca, viewer.aviator.betPerRound);
  }
  if (room.phase === "flying") {
    return renderAviatorFlying(room, viewerUserId);
  }
  return renderAviatorCrashed(room);
}

function renderAviatorIdle(room: AviatorRoomState, banca: number) {
  const lines = [
    `${E.carregando} **Aguardando jogadores...**`,
    "Aposte para dar início à contagem regressiva da próxima decolagem.",
    "",
    `${E.em} Sua banca: ${fmt(banca)} fichas`,
  ];

  const container = infoContainer({
    title: `${E.comunidade2} Aviator`,
    description: lines.join("\n"),
    avatarUrl: THUMBNAIL_URL,
  });

  const buttons = row(
    secondaryButton(acid("apostar", room.channelId), "Iniciar"),
    secondaryButton(acid("depositar", room.channelId), "Depositar"),
    secondaryButton(acid("voltar", room.channelId), "Voltar")
  );

  return screen(container, buttons);
}

function renderAviatorBetting(room: AviatorRoomState, banca: number, betPerRound: number) {
  const remaining = Math.max(
    0,
    Math.ceil(AVIATOR_BETTING_SECONDS - (Date.now() - room.phaseStartedAt) / 1000)
  );

  const jogadores =
    room.bets.length > 0
      ? room.bets.map((b) => `  * <@${b.userId}> — ${fmt(b.amount)} fichas`)
      : ["  * Nenhum jogador ainda"];

  const lines = [
    `${E.carregando} **Decolagem em ${remaining}s**`,
    "",
    `${E.ticketUser} **Jogadores nesta rodada:**`,
    ...jogadores,
    "",
    `${E.em} Banca: ${fmt(banca)} fichas`,
    `${E.parceria} Valor inicial: ${fmt(betPerRound)} fichas`,
  ];

  const container = infoContainer({
    title: `${E.comunidade2} Aviator`,
    description: lines.join("\n"),
    avatarUrl: THUMBNAIL_URL,
  });

  const buttons = row(
    secondaryButton(acid("apostar", room.channelId), "Apostar"),
    secondaryButton(acid("depositar", room.channelId), "Depositar"),
    secondaryButton(acid("resultados", room.channelId), "Resultados"),
    secondaryButton(acid("voltar", room.channelId), "Voltar")
  );

  return screen(container, buttons);
}

function renderAviatorFlying(room: AviatorRoomState, viewerUserId: string) {
  const m = multiplicadorAtualAviator(room.channelId);

  const voando = room.bets.filter((b) => b.cashedOutAt === null);
  const saltaram = room.bets.filter((b) => b.cashedOutAt !== null);

  const voandoLines =
    voando.length > 0
      ? voando.map((b) => `  * <@${b.userId}> - ${fmt(b.amount * m)} fichas`)
      : ["  * Ninguém está voando"];

  const saltaramLines = saltaram.map(
    (b) => `  * <@${b.userId}> - saiu em ${fmtMult(b.cashedOutAt!)}, +${fmt(b.won ?? 0)} fichas`
  );

  const lines = [
    `        ${E.arrowright} **${fmtMult(m)}**`,
    "",
    `${E.ticketUser} **Voando:**`,
    ...voandoLines,
  ];

  if (saltaramLines.length > 0) {
    lines.push("", `${E.parceria} **Saltou do Avião:**`, ...saltaramLines);
  }

  const container = infoContainer({
    title: `${E.comunidade2} Aviator`,
    description: lines.join("\n"),
    avatarUrl: THUMBNAIL_URL,
  });

  const viewerBet = room.bets.find((b) => b.userId === viewerUserId);
  const podeSacar = !!viewerBet && viewerBet.cashedOutAt === null;

  const buttons = row(secondaryButton(acid("sacar", room.channelId), "Sacar").setDisabled(!podeSacar));

  return screen(container, buttons);
}

function renderAviatorCrashed(room: AviatorRoomState) {
  const resultLines = room.bets.map((b) =>
    b.cashedOutAt !== null
      ? `  * <@${b.userId}> - saiu em ${fmtMult(b.cashedOutAt)} › ganhou ${fmt(b.won ?? 0)} fichas`
      : `  * <@${b.userId}> - não sacou › perdeu ${fmt(b.amount)} fichas`
  );

  const lines = [
    `           ${E.alerta} Explodiu em ${fmtMult(room.crashPoint ?? 1)}`,
    "",
    `${E.anuncio} **Resultado da rodada:**`,
    ...(resultLines.length > 0 ? resultLines : ["  * Ninguém apostou nessa rodada"]),
    "",
    "**Próxima rodada em instantes**",
  ];

  const container = infoContainer({
    title: `${E.comunidade2} Aviator`,
    description: lines.join("\n"),
    avatarUrl: THUMBNAIL_URL,
  });

  const buttons = row(secondaryButton(acid("sair", room.channelId), "Sair"));

  return screen(container, buttons);
}
