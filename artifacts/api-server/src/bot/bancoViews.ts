import {
  infoContainer,
  primaryButton,
  secondaryButton,
  successButton,
  dangerButton,
  row,
  COLORS,
  MessageFlags,
} from "./v2/index";
import {
  processAccount,
  activeLoans,
  totalDebt,
  LOAN_AMOUNTS,
  CONVERT_AMOUNTS,
  INVEST_AMOUNTS,
  INVITE_VALUE,
  LOAN_INTEREST,
  LOAN_DUE_DAYS,
  LOAN_LOCK_DAYS,
  UNLOCK_THRESHOLD,
  MAX_ACTIVE_LOANS,
} from "./economyStore";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

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

// ─── Menu principal ────────────────────────────────────────────────────────────

export function renderHome(userId: string) {
  const user = processAccount(userId);

  const lines = [
    `💰 **Fichas:** ${fmt(user.fichas)}`,
    user.bankLocked
      ? `🔒 **Conta bloqueada** — dívida: ${fmt(totalDebt(user))} fichas`
      : `✅ Conta em dia`,
  ];

  const container = infoContainer({
    title: "🏦 Banco do Servidor",
    description: lines.join("\n"),
    accentColor: COLORS.info,
  });

  const buttons = row(
    secondaryButton(bid("emprestimos", userId), "💸 Empréstimos"),
    secondaryButton(bid("conversao", userId), "🔄 Conversão"),
    secondaryButton(bid("carteira", userId), "💳 Carteira"),
    secondaryButton(bid("investir", userId), "📈 Investir")
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

  if (user.bankLocked) {
    lines.push(
      "🔒 **Sua conta está bloqueada!**",
      `Você demorou demais para pagar um empréstimo e o banco confiscou suas fichas.`,
      `**Dívida total:** ${fmt(debt)} fichas`,
      `**Pago até agora:** ${fmt(user.unlockPaid)} / ${fmt(Math.ceil(user.lockDebt * UNLOCK_THRESHOLD))} fichas necessários (${Math.round(UNLOCK_THRESHOLD * 100)}% da dívida travada)`,
      "",
      "📩 **O único jeito de conseguir fichas agora é convidar novos membros e converter os invites em Conversão.**",
      "Assim que pagar pelo menos 30% do que devia no momento do bloqueio, sua conta é desbloqueada."
    );
  } else if (loans.length === 0) {
    lines.push(
      "Você não tem empréstimos ativos.",
      `Peça um empréstimo abaixo: **${Math.round(LOAN_INTEREST * 100)}% de juros** e **${LOAN_DUE_DAYS} dias** de prazo.`,
      `Se atrasar, os juros aumentam a cada dia e, após ${LOAN_LOCK_DAYS} dias sem pagar, sua conta é fechada e todas as fichas são confiscadas.`
    );
  } else {
    lines.push(`📋 **Empréstimos ativos (${loans.length}/${MAX_ACTIVE_LOANS}):**`);
    for (const loan of loans) {
      const overdue = loan.dueAt < now;
      const dueStr = `<t:${Math.floor(loan.dueAt / 1000)}:R>`;
      lines.push(
        `• \`${loan.id}\` — **${fmt(loan.total)} fichas** a devolver ${
          overdue ? "⚠️ **ATRASADO** (juros aumentando)" : `(vence ${dueStr})`
        }`
      );
    }
    lines.push("", `**Dívida total:** ${fmt(debt)} fichas`);
  }

  const container = infoContainer({
    title: "💸 Empréstimos",
    description: lines.join("\n"),
    accentColor: user.bankLocked ? COLORS.danger : COLORS.info,
  });

  const rows: ReturnType<typeof row>[] = [];

  if (!user.bankLocked) {
    const canTakeMore = loans.length < MAX_ACTIVE_LOANS;
    rows.push(
      row(
        ...LOAN_AMOUNTS.map((amount) =>
          primaryButton(bid("loan", userId, amount), `${fmt(amount)} fichas`).setDisabled(!canTakeMore)
        )
      )
    );
  }

  const payRow = [secondaryButton(bid("home", userId), "⬅️ Voltar")];
  if (debt > 0) {
    payRow.unshift(successButton(bid("loan", userId, "pagar"), "💵 Pagar Dívidas"));
  }
  rows.push(row(...payRow));

  return screen(container, ...rows);
}

// ─── Conversão ─────────────────────────────────────────────────────────────────

export function renderConversao(userId: string) {
  const user = processAccount(userId);

  const lines = [
    `📩 **Invites pendentes:** ${user.pendingInvites}`,
    `💱 **Cada invite vale ${fmt(INVITE_VALUE)} fichas.**`,
    "",
    "Convide novos membros para o servidor com seu link de convite e depois converta os invites aqui.",
  ];

  const container = infoContainer({
    title: "🔄 Conversão de Invites",
    description: lines.join("\n"),
    accentColor: COLORS.info,
  });

  const buttonsRow = row(
    ...CONVERT_AMOUNTS.map((amount) =>
      successButton(bid("conv", userId, amount), `${amount} invites`).setDisabled(
        user.pendingInvites < amount
      )
    )
  );

  return screen(container, buttonsRow, row(secondaryButton(bid("home", userId), "⬅️ Voltar")));
}

// ─── Carteira ──────────────────────────────────────────────────────────────────

export function renderCarteira(userId: string) {
  const user = processAccount(userId);
  const loans = activeLoans(user);
  const now = Date.now();

  const lines: string[] = [
    `💰 **Fichas:** ${fmt(user.fichas)}`,
    `📩 **Invites pendentes:** ${user.pendingInvites}`,
    user.bankLocked ? "🔒 **Conta bloqueada**" : "✅ Conta em dia",
  ];

  if (loans.length > 0) {
    lines.push(`\n📋 **Dívidas ativas (${loans.length}):**`);
    for (const loan of loans) {
      const overdue = loan.dueAt < now;
      const dueStr = `<t:${Math.floor(loan.dueAt / 1000)}:R>`;
      lines.push(
        `• **${fmt(loan.total)} fichas** ${overdue ? "⚠️ **ATRASADO**" : `(vence ${dueStr})`}`
      );
    }
  } else {
    lines.push("\n✅ **Sem dívidas ativas**");
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
    title: "💳 Sua Carteira",
    description: lines.join("\n"),
    accentColor: COLORS.info,
  });

  return screen(container, row(secondaryButton(bid("home", userId), "⬅️ Voltar")));
}

// ─── Investir ──────────────────────────────────────────────────────────────────

export function renderInvestir(userId: string) {
  const user = processAccount(userId);
  const inv = user.investment;

  const lines: string[] = [];
  const rows: ReturnType<typeof row>[] = [];

  if (user.bankLocked) {
    lines.push(
      "🔒 **Sua conta está bloqueada.**",
      "Pague suas dívidas em Empréstimos para voltar a investir."
    );
    rows.push(row(secondaryButton(bid("home", userId), "⬅️ Voltar")));
  } else if (!inv.active) {
    lines.push(
      "Você não tem nenhum investimento ativo.",
      "Escolha um valor para começar. O valor investido sobe ou desce a cada hora (📈 +10%, 📉 -10%, ou uma variação aleatória) — o mercado é o mesmo para todo mundo.",
      "⚠️ Se o valor chegar a zero e você não sacar, ele pode continuar caindo e você fica devendo fichas."
    );
    rows.push(
      row(
        ...INVEST_AMOUNTS.map((amount) =>
          primaryButton(bid("inv", userId, amount), `${fmt(amount)} fichas`).setDisabled(
            user.fichas < amount
          )
        )
      )
    );
    rows.push(row(secondaryButton(bid("home", userId), "⬅️ Voltar")));
  } else {
    const sign = inv.balance >= 0 ? "+" : "";
    const pctSign = inv.lastChangePct >= 0 ? "+" : "";
    const arrow = inv.lastChangePct > 0 ? "📈" : inv.lastChangePct < 0 ? "📉" : "➖";

    lines.push(
      `${arrow} **Valor atual:** ${sign}${fmt(inv.balance)} fichas`,
      `**Total depositado:** ${fmt(inv.deposited)} fichas`,
      `**Última variação:** ${pctSign}${Math.round(inv.lastChangePct * 100)}%`,
      "",
      inv.balance < 0
        ? "⚠️ **Você está devendo neste investimento.** Deposite mais para tentar recuperar ou saque para encerrar."
        : "O mercado é o mesmo para todo mundo e muda a cada hora. Deposite mais ou saque quando quiser."
    );

    rows.push(
      row(
        ...INVEST_AMOUNTS.map((amount) =>
          secondaryButton(bid("inv", userId, amount), `+${fmt(amount)}`).setDisabled(user.fichas < amount)
        )
      )
    );
    rows.push(
      row(dangerButton(bid("inv", userId, "sacar"), "💵 Sacar Tudo"), secondaryButton(bid("home", userId), "⬅️ Voltar"))
    );
  }

  const container = infoContainer({
    title: "📈 Investimentos",
    description: lines.join("\n"),
    accentColor: user.bankLocked ? COLORS.danger : COLORS.info,
  });

  return screen(container, ...rows);
}
