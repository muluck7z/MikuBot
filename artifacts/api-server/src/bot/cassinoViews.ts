import { infoContainer, secondaryButton, row, MessageFlags } from "./v2/index";
import { processAccount, ROLETA_NUMEROS } from "./economyStore";

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

  const buttons = row(secondaryButton(cid("roleta", userId), "Roleta"));

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
      `  * A roleta consiste em números de 1 a ${ROLETA_NUMEROS} (brancos) e (pretos), você deve escolher uma cor e um número da sorte; se sua cor for onde a bola branca parou mas não em cima do seu número da sorte, você ganha o dobro do que apostou mas, se for o contrário você perde o valor que apostou; se fosse sua cor e o número da sorte que tivesse caído, o valor que você apostou seria multiplicado por 100 mas, se fosse o contrário a cor oposta e o mesmo número da sorte, o valor que você apostou seria multiplicado por 100 e descontado da sua banca, e caso a sua banca não consiga tancar esse valor, pegamos o valor que estiver no seu banco mas, se não tiver saldo suficiente em seu banco vira dívida em seu nome.`,
      "",
      `${E.ticketUser} Banca: ${fmt(cassino.banca)} fichas`,
      `${E.ticket} Valor por rodada: ${fmt(cassino.betPerRound)} fichas`,
      `👛 **Saldo na carteira:** ${fmt(user.fichas)} fichas`,
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
