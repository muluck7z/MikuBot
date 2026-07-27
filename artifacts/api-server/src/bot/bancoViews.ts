import {
  infoContainer,
  secondaryButton,
  row,
  MessageFlags,
} from "./v2/index";
import {
  processAccount,
  activeLoans,
  totalDebt,
  MAX_LOAN_AMOUNT,
  INVITE_VALUE,
  LOAN_INTEREST,
  LOAN_DUE_DAYS,
  LOAN_LOCK_DAYS,
  LOAN_LATE_DAILY_RATE,
  UNLOCK_THRESHOLD,
  MAX_ACTIVE_LOANS,
  INVEST_TICK_MS,
} from "./economyStore";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

// ─── Emojis customizados usados nos cards do banco ─────────────────────────────
const E = {
  banco: "<:comunidade2:1531072981688914103>",
  poupanca: "<:em:1531074006978138292>",
  suporte: "<:suporte:1531074502790873171>",
  ticketUser: "<:ticket_user:1530817417842921492>",
  termos: "<:svsino:1530817949340926025>",
  clock: "<:clock:1508157710422507663>",
  announce: "<:ticket_announce:1530817537007161374>",
  parceria: "<:parceria:1531111024369995868>",
};

/** Monta o customId de um botão do banco, sempre com o dono embutido no final. */
function bid(action: string, userId: string, arg?: string | number): string {
  return `banco:${action}:${arg ?? "_"}:${userId}`;
}

// helper para juntar container + linhas de botões numa resposta pública de components v2
function screen(container: ReturnType<typeof infoContainer>, ...rows: ReturnType<typeof row>[]) {
  return {
    components: [container, ...rows],
    flags: MessageFlags.IsComponentsV2,
  };
}

/** Timestamp (ms) do próximo "tick" de mercado, alinhado ao bucket de 10 minutos. */
function nextInvestTick(lastUpdate: number): number {
  return (Math.floor(lastUpdate / INVEST_TICK_MS) + 1) * INVEST_TICK_MS;
}

// ─── Menu principal ────────────────────────────────────────────────────────────

export function renderHome(userId: string) {
  const user = processAccount(userId);

  const lines = [
    "Nosso banco oferece oportunidades exclusivas aos nossos clientes! Vocês podem pedir empréstimos, Investir e muito mais!",
  ];

  if (user.bankLocked) {
    lines.push("", `🔒 **Sua conta está bloqueada** — dívida: ${fmt(totalDebt(user))} fichas`);
  }

  const container = infoContainer({
    title: `${E.banco} Banco Central`,
    description: lines.join("\n"),
  });

  const buttons = row(
    secondaryButton(bid("emprestimos", userId), "Empréstimos"),
    secondaryButton(bid("conversao", userId), "Conversão"),
    secondaryButton(bid("carteira", userId), "Carteira"),
    secondaryButton(bid("investir", userId), "Investir")
  );

  return screen(container, buttons);
}

// ─── Empréstimos ───────────────────────────────────────────────────────────────

export function renderEmprestimos(userId: string) {
  const user = processAccount(userId);
  const loans = activeLoans(user);
  const debt = totalDebt(user);
  const now = Date.now();

  const lines: string[] = [];

  lines.push(
    `${E.termos} **Termos de empréstimos:**`,
    `> Ao pegar um empréstimo você deve retornar ao banco ${Math.round(
      LOAN_INTEREST * 100
    )}% a mais do valor que você pegou com o banco e tendo que pagar em até ${LOAN_DUE_DAYS} dias sem juros. Caso você não consiga pagar a tempo, os juros iram ser de ${Math.round(
      LOAN_LATE_DAILY_RATE * 100
    )}% ao dia até chegar ao dia ${LOAN_LOCK_DAYS} onde iremos bloquear sua conta e seu saldo ficará sob custódia de nosso banco até você pagar ${Math.round(
      UNLOCK_THRESHOLD * 100
    )}% do valor que deve. O valor máximo por empréstimo é ${fmt(MAX_LOAN_AMOUNT)} fichas.`,
    ""
  );

  if (user.bankLocked) {
    lines.push(
      "🔒 **Sua conta está bloqueada!**",
      "Você demorou demais para pagar um empréstimo e o banco confiscou suas fichas.",
      `**Pago até agora:** ${fmt(user.unlockPaid)} / ${fmt(Math.ceil(user.lockDebt * UNLOCK_THRESHOLD))} fichas necessários`,
      "",
      "📩 O único jeito de conseguir fichas agora é convidar novos membros e converter os invites em Conversão.",
      ""
    );
  }

  lines.push(`${E.ticketUser} **Empréstimos pendentes (${loans.length}):**`);
  if (loans.length === 0) {
    lines.push("> Nenhum empréstimo pendente no momento.");
  } else {
    for (const loan of loans) {
      const overdue = loan.dueAt < now;
      const dueStr = `<t:${Math.floor(loan.dueAt / 1000)}:R>`;
      lines.push(`> ${fmt(loan.total)} fichas a pagar em até ${dueStr}${overdue ? " ⚠️ **ATRASADO**" : ""}`);
    }
  }

  lines.push("", `${E.clock} **Dívida pendente:** ${fmt(debt)} fichas`);

  const container = infoContainer({
    title: `${E.suporte} Empréstimos`,
    description: lines.join("\n"),
  });

  const buttons: ReturnType<typeof secondaryButton>[] = [];
  if (!user.bankLocked) {
    const canTakeMore = loans.length < MAX_ACTIVE_LOANS;
    buttons.push(secondaryButton(bid("loan_open", userId), "Empréstimo").setDisabled(!canTakeMore));
  }
  if (debt > 0) {
    buttons.push(secondaryButton(bid("loan", userId, "pagar"), "Pagar Dívidas"));
  }
  buttons.push(secondaryButton(bid("home", userId), "Voltar"));

  return screen(container, row(...buttons));
}

// ─── Conversão ─────────────────────────────────────────────────────────────────

export function renderConversao(userId: string) {
  const user = processAccount(userId);

  const lines = [
    `${E.poupanca} **Invites pendentes:** ${user.pendingInvites}`,
    `${E.announce} **Cada invite vale ${fmt(INVITE_VALUE)} fichas**`,
    "",
    "Convide novos membros para o servidor com seu link de convite e depois converta os invites aqui.",
  ];

  const container = infoContainer({
    title: `${E.banco} Conversão de Invites`,
    description: lines.join("\n"),
  });

  const buttons = row(
    secondaryButton(bid("conv_open", userId), "Conversão").setDisabled(user.pendingInvites < 1),
    secondaryButton(bid("home", userId), "Voltar")
  );

  return screen(container, buttons);
}

// ─── Carteira ──────────────────────────────────────────────────────────────────

export function renderCarteira(userId: string) {
  const user = processAccount(userId);
  const loans = activeLoans(user);
  const now = Date.now();

  const lines: string[] = [
    `${E.ticketUser} **Proprietário:** <@${userId}>`,
    `${E.poupanca} **poupança:** ${fmt(user.fichas)}`,
    `${E.suporte} **Conta em dia:** ${user.bankLocked ? "Não" : "Sim"}`,
    "",
    `${E.poupanca} **Dívidas pendentes (${loans.length})**`,
  ];

  if (loans.length === 0) {
    lines.push("* Nenhuma dívida pendente");
  } else {
    for (const loan of loans) {
      const overdue = loan.dueAt < now;
      const dueStr = `<t:${Math.floor(loan.dueAt / 1000)}:R>`;
      lines.push(`* ${fmt(loan.total)} fichas, tempo para pagamento ${dueStr}${overdue ? " ⚠️ **ATRASADO**" : ""}`);
    }
  }

  const inv = user.investment;
  if (inv.active) {
    const sign = inv.balance >= 0 ? "+" : "";
    lines.push(
      "",
      `📈 **Investimento em andamento:** ${sign}${fmt(inv.balance)} fichas (depositado: ${fmt(inv.deposited)})`
    );
  }

  const container = infoContainer({
    title: `${E.banco} Sua Carteira`,
    description: lines.join("\n"),
  });

  return screen(container, row(secondaryButton(bid("home", userId), "Voltar")));
}

// ─── Investir ──────────────────────────────────────────────────────────────────

export function renderInvestir(userId: string) {
  const user = processAccount(userId);
  const inv = user.investment;

  const lines: string[] = [];
  const buttons: ReturnType<typeof secondaryButton>[] = [];

  if (user.bankLocked) {
    lines.push(
      "**Sua conta está bloqueada.**",
      "Pague suas dívidas em Empréstimos para voltar a investir."
    );
    buttons.push(secondaryButton(bid("home", userId), "Voltar"));
  } else if (!inv.active) {
    lines.push(
      "Você não tem nenhum investimento ativo.",
      "Escolha um valor para começar. O valor investido sobe ou desce a cada 10 minutos (+10%, -10%, ou uma variação aleatória) — o mercado é o mesmo para todo mundo.",
      "Se o valor chegar a zero e você não sacar, ele pode continuar caindo e você fica devendo fichas."
    );
    buttons.push(secondaryButton(bid("inv_open", userId), "Investir").setDisabled(user.fichas < 1));
    buttons.push(secondaryButton(bid("home", userId), "Voltar"));
  } else {
    const sign = inv.balance >= 0 ? "+" : "";
    const pctSign = inv.lastChangePct >= 0 ? "+" : "";
    const nextTick = nextInvestTick(inv.lastUpdate);

    lines.push(
      `Valor atual: ${sign}${fmt(inv.balance)} fichas`,
      `Última variação: ${pctSign}${Math.round(inv.lastChangePct * 100)}%`,
      `Tempo para a variação: <t:${Math.floor(nextTick / 1000)}:R>`
    );

    if (inv.balance < 0) {
      lines.push(
        "",
        "**Você está devendo neste investimento.** Deposite mais para tentar recuperar ou saque para encerrar."
      );
    }

    buttons.push(secondaryButton(bid("inv_open", userId), "Investir").setDisabled(user.fichas < 1));
    buttons.push(secondaryButton(bid("inv", userId, "sacar"), "Sacar"));
    buttons.push(secondaryButton(bid("home", userId), "Voltar"));
  }

  const container = infoContainer({
    title: `${E.parceria} Investimento`,
    description: lines.join("\n"),
  });

  return screen(container, row(...buttons));
}
