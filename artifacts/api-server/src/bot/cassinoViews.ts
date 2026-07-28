import { infoContainer, secondaryButton, row, MessageFlags } from "./v2/index";
import {
  processAccount,
  ROLETA_NUMEROS,
  getAviatorRoom,
  multiplicadorAtualAviator,
  AVIATOR_BETTING_SECONDS,
  type AviatorRoomState,
  type RoletaCor,
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

  // Mostra as regras apenas na primeira vez (banca = 0 e ainda não viu as regras).
  // Após a primeira exibição, seenRules fica true e o painel compacto é sempre usado.
  const showRules = cassino.banca <= 0 && !cassino.seenRules;

  if (cassino.banca > 0 || cassino.seenRules) {
    // Painel compacto — fichas na banca ou já conhece as regras
    lines = [
      `${E.ticketUser} Banca: ${fmt(cassino.banca)} fichas`,
      `${E.ticket} Valor por rodada: ${fmt(cassino.betPerRound)} fichas`,
    ];

    if (cassino.lastResult) {
      const { cor, numero, apostaCor, apostaNumero, won, amount, debtAdded } = cassino.lastResult;
      const corLabel = cor === "preto" ? "PRETO" : "BRANCO";
      const apostaCorsLabel = apostaCor === "preto" ? "Preto" : "Branco";
      const verbo = won ? "ganhou" : "perdeu";
      lines.push("");
      lines.push(`> Você escolheu: ${apostaCorsLabel} ⟨${apostaNumero}⟩`);
      lines.push(`${E.announce} ${corLabel} ⟨${numero}⟩, você ${verbo} ${fmt(amount)} fichas`);
      if (debtAdded && debtAdded > 0) {
        lines.push(`⚠️ Isso gerou uma dívida de ${fmt(debtAdded)} fichas em seu nome.`);
      }
    }
  } else {
    // Primeira vez: exibe as regras completas
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

  void showRules; // capturado implicitamente acima, suprime warning

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

// ─── Roleta em animação (girando) ─────────────────────────────────────────────

/**
 * Painel temporário exibido durante a animação de giro.
 * `cor`    = cor sendo exibida no momento (alterna durante a fase 1, fixa na fase 2).
 * `numero` = null na fase de cor (apenas cores piscam), número na fase 2.
 */
export function renderRoletaSpinning(cor: RoletaCor, numero: number | null) {
  const corLabel = cor === "preto" ? "PRETO" : "BRANCO";

  const lines: string[] = [""];
  if (numero === null) {
    lines.push(`# ${corLabel}`);
  } else {
    lines.push(`# ${corLabel} ⟨${numero}⟩`);
  }

  const container = infoContainer({
    title: `${E.suporte} Brazino - Roleta`,
    description: lines.join("\n"),
    avatarUrl: THUMBNAIL_URL,
  });

  return screen(container);
}

// ─── Aviator ─────────────────────────────────────────────────────────────────────

function fmtMult(m: number): string {
  return `${m.toFixed(2)}x`;
}

/** customId de um botão do Aviator — sempre com o dono embutido no final, igual à roleta. */
function acid(action: string, userId: string): string {
  return `aviator:${action}:_:${userId}`;
}

export function renderAviatorResultados(userId: string) {
  const room = getAviatorRoom(userId);

  const lines =
    room.crashHistory.length > 0
      ? [room.crashHistory.map((c) => fmtMult(c)).join(" · ")]
      : ["Você ainda não jogou nenhuma rodada."];

  const container = infoContainer({
    title: `${E.comunidade2} Aviator — Resultados`,
    description: [`${E.anuncio} **Suas últimas ${room.crashHistory.length} rodadas:**`, "", ...lines].join("\n"),
    avatarUrl: THUMBNAIL_URL,
  });

  const buttons = row(secondaryButton(acid("fechar_resultados", userId), "Voltar"));
  return screen(container, buttons);
}

/** Painel individual do Aviator — cada usuário tem sua própria sala/rodada, igual à roleta. */
export function renderAviator(userId: string) {
  const room = getAviatorRoom(userId);
  const viewer = processAccount(userId);

  if (room.phase === "idle") {
    return renderAviatorIdle(room, viewer.aviator.banca);
  }
  if (room.phase === "betting") {
    return renderAviatorBetting(room, viewer.aviator.banca, viewer.aviator.betPerRound);
  }
  if (room.phase === "flying") {
    return renderAviatorFlying(room);
  }
  return renderAviatorCrashed(room);
}

function renderAviatorIdle(room: AviatorRoomState, banca: number) {
  const lines = [
    `${E.carregando} **Pronto para decolar**`,
    "Aposte para dar início à contagem regressiva da sua decolagem.",
    "",
    `${E.em} Sua banca: ${fmt(banca)} fichas`,
  ];

  const container = infoContainer({
    title: `${E.comunidade2} Aviator`,
    description: lines.join("\n"),
    avatarUrl: THUMBNAIL_URL,
  });

  const buttons = row(
    secondaryButton(acid("apostar", room.userId), "Iniciar"),
    secondaryButton(acid("depositar", room.userId), "Depositar"),
    secondaryButton(acid("sacar_banca", room.userId), "Sacar").setDisabled(banca <= 0),
    secondaryButton(acid("resultados", room.userId), "Resultados"),
    secondaryButton(acid("voltar", room.userId), "Voltar")
  );

  return screen(container, buttons);
}

function renderAviatorBetting(room: AviatorRoomState, banca: number, betPerRound: number) {
  const remaining = Math.max(
    0,
    Math.ceil(AVIATOR_BETTING_SECONDS - (Date.now() - room.phaseStartedAt) / 1000)
  );

  const lines = [
    `${E.carregando} **Decolagem em ${remaining}s**`,
    "",
    `${E.ticketUser} Sua aposta: ${fmt(room.bet?.amount ?? 0)} fichas`,
    `${E.em} Banca: ${fmt(banca)} fichas`,
    `${E.parceria} Valor inicial: ${fmt(betPerRound)} fichas`,
  ];

  const container = infoContainer({
    title: `${E.comunidade2} Aviator`,
    description: lines.join("\n"),
    avatarUrl: THUMBNAIL_URL,
  });

  const row1 = row(
    secondaryButton(acid("depositar", room.userId), "Depositar"),
    secondaryButton(acid("sacar_banca", room.userId), "Sacar").setDisabled(banca <= 0)
  );
  const row2 = row(
    secondaryButton(acid("resultados", room.userId), "Resultados"),
    secondaryButton(acid("voltar", room.userId), "Voltar")
  );

  return screen(container, row1, row2);
}

function renderAviatorFlying(room: AviatorRoomState) {
  const m = multiplicadorAtualAviator(room.userId);
  const bet = room.bet;

  const lines = [
    `        ${E.arrowright} **${fmtMult(m)}**`,
    "",
    bet && bet.cashedOutAt === null
      ? `${E.ticketUser} Voando com ${fmt(bet.amount * m)} fichas`
      : bet && bet.cashedOutAt !== null
        ? `${E.parceria} Você saiu em ${fmtMult(bet.cashedOutAt)}, +${fmt(bet.won ?? 0)} fichas`
        : `${E.ticketUser} Você não apostou nessa rodada`,
  ];

  const container = infoContainer({
    title: `${E.comunidade2} Aviator`,
    description: lines.join("\n"),
    avatarUrl: THUMBNAIL_URL,
  });

  const podeSacar = !!bet && bet.cashedOutAt === null;

  const buttons = podeSacar
    ? row(secondaryButton(acid("sacar", room.userId), "Sacar"))
    : row(secondaryButton(acid("assistir", room.userId), "Assistir").setDisabled(true));

  return screen(container, buttons);
}

function renderAviatorCrashed(room: AviatorRoomState) {
  const bet = room.bet;
  const resultLine =
    bet && bet.cashedOutAt !== null
      ? `  * Você saiu em ${fmtMult(bet.cashedOutAt)} › ganhou ${fmt(bet.won ?? 0)} fichas`
      : bet
        ? `  * Você não sacou › perdeu ${fmt(bet.amount)} fichas`
        : "  * Você não apostou nessa rodada";

  const lines = [
    `           ${E.alerta} Explodiu em ${fmtMult(room.crashPoint ?? 1)}`,
    "",
    `${E.anuncio} **Resultado da rodada:**`,
    resultLine,
    "",
    "**Próxima rodada em instantes**",
  ];

  const container = infoContainer({
    title: `${E.comunidade2} Aviator`,
    description: lines.join("\n"),
    avatarUrl: THUMBNAIL_URL,
  });

  const buttons = row(
    secondaryButton(acid("sair", room.userId), "Sair"),
    secondaryButton(acid("voltar", room.userId), "Voltar")
  );

  return screen(container, buttons);
}
