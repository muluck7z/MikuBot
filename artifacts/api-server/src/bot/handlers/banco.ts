import {
  type ButtonInteraction,
  type ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import { errorContainer, successContainer, v2Reply, v2EphemeralReply } from "../v2/index";
import {
  renderHome,
  renderEmprestimos,
  renderConversao,
  renderCarteira,
  renderInvestir,
} from "../bancoViews";
import { scheduleInvestAutoRefresh, clearInvestAutoRefresh } from "../investAutoRefresh";
import {
  processAccount,
  activeLoans,
  bankLoans,
  payLoanByIndex,
  takeLoan,
  convertInvites,
  investFichas,
  withdrawInvestment,
  withdrawPartial,
  activePeerLoansAsBorrower,
  payPeerLoanByIndex,
  LOAN_DUE_DAYS,
  MAX_LOAN_AMOUNT,
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

export async function handleBancoButton(interaction: ButtonInteraction, parts: string[]) {
  // customId: banco:<action>:<arg|_>:<ownerId>
  const [, action, argRaw, ownerId] = parts;
  const arg = argRaw === "_" ? undefined : argRaw;

  if (!ownerId) return;
  if (interaction.user.id !== ownerId) {
    await interaction.reply(
      v2EphemeralReply([errorContainer("Este não é o seu banco — use `/banco` para abrir o seu.")])
    );
    return;
  }

  const userId = ownerId;

  // ── Navegação entre telas ─────────────────────────────────────────────────
  if (action === "home") {
    clearInvestAutoRefresh(interaction.message?.id);
    await interaction.update(renderHome(userId) as never);
    return;
  }
  if (action === "emprestimos") {
    clearInvestAutoRefresh(interaction.message?.id);
    await interaction.update(renderEmprestimos(userId) as never);
    return;
  }
  if (action === "conversao") {
    clearInvestAutoRefresh(interaction.message?.id);
    await interaction.update(renderConversao(userId) as never);
    return;
  }
  if (action === "carteira") {
    clearInvestAutoRefresh(interaction.message?.id);
    await interaction.update(renderCarteira(userId) as never);
    return;
  }
  if (action === "investir") {
    await interaction.update(renderInvestir(userId) as never);
    scheduleInvestAutoRefresh(interaction, userId);
    return;
  }

  // ── Abrir formulários (modais) para inserir o valor ─────────────────────────
  if (action === "loan_open") {
    const modal = new ModalBuilder().setCustomId(`banco:loan_submit:_:${userId}`).setTitle("Pegar Empréstimo");
    const input = new TextInputBuilder()
      .setCustomId("loan_amount")
      .setLabel(`Quanto de empréstimo (máx: ${fmt(MAX_LOAN_AMOUNT)})`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10)
      .setPlaceholder("Ex: 1000");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }
  if (action === "conv_open") {
    const modal = new ModalBuilder().setCustomId(`banco:conv_submit:_:${userId}`).setTitle("Converter Invites");
    const input = new TextInputBuilder()
      .setCustomId("conv_amount")
      .setLabel("Quantos invites converter")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10)
      .setPlaceholder("Ex: 10");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }
  if (action === "inv_open") {
    const modal = new ModalBuilder().setCustomId(`banco:inv_submit:_:${userId}`).setTitle("Investir");
    const input = new TextInputBuilder()
      .setCustomId("inv_amount")
      .setLabel("Quanto investir")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10)
      .setPlaceholder("Ex: 100");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }
  if (action === "sac_open") {
    const user = processAccount(userId);
    const inv = user.investment;

    if (!inv.active) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("Você não tem nenhum investimento ativo.")])
      );
      return;
    }

    if (inv.balance <= 0) {
      // saldo negativo/zerado: não dá pra sacar parte, só encerrar tudo
      const result = withdrawInvestment(userId);
      clearInvestAutoRefresh(interaction.message?.id);
      await interaction.update(renderInvestir(userId) as never);
      if (result.ok) {
        const msg =
          result.amount >= 0
            ? `Você sacou **${fmt(result.amount)} fichas** do seu investimento.`
            : `Seu investimento fechou negativo. Você ficou devendo **${fmt(Math.abs(result.amount))} fichas**.`;
        await toast(interaction, msg, result.amount >= 0);
      }
      return;
    }

    const modal = new ModalBuilder().setCustomId(`banco:sac_submit:_:${userId}`).setTitle("Sacar Investimento");
    const input = new TextInputBuilder()
      .setCustomId("sac_amount")
      .setLabel(`Quanto sacar (disponível: ${fmt(inv.balance)})`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10)
      .setPlaceholder(`Ex: ${fmt(inv.balance)}`);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  // ── Empréstimos: pagar uma dívida específica (banco, cassino, investimento ou pessoal vencido) ──
  // arg aqui é a tela de origem ("carteira" ou "emprestimos"), que também
  // decide o escopo: em "emprestimos" só entram empréstimos reais do banco;
  // em "carteira" entram todas as dívidas.
  if (action === "loan_pay_open") {
    const origin = arg === "carteira" ? "carteira" : "emprestimos";
    const scope = origin === "carteira" ? "all" : "bank";
    const user = processAccount(userId);
    const loans = scope === "bank" ? bankLoans(user) : activeLoans(user).sort((a, b) => a.takenAt - b.takenAt);

    if (loans.length === 0) {
      await interaction.reply(v2EphemeralReply([errorContainer("Você não tem dívidas para pagar.")]));
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`banco:loan_pay_submit:${origin}:${userId}`)
      .setTitle("Pagar Dívidas");
    const indexInput = new TextInputBuilder()
      .setCustomId("loan_index")
      .setLabel(loans.length > 1 ? `Qual dívida pagar? (número: 1 a ${loans.length})` : "Qual dívida pagar? (número: 1)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(3)
      .setPlaceholder("1");
    const amountInput = new TextInputBuilder()
      .setCustomId("loan_amount")
      .setLabel("Quanto pagar")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10)
      .setPlaceholder(String(loans[0]!.total));
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(indexInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput)
    );
    await interaction.showModal(modal);
    return;
  }

  // ── Empréstimos pessoais: pagar direto pela Carteira ─────────────────────────
  if (action === "peer_pay_open") {
    const owed = activePeerLoansAsBorrower(userId);
    if (owed.length === 0) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("Você não tem empréstimos pessoais para pagar.")])
      );
      return;
    }

    const nicks = await Promise.all(
      owed.map(async (l, i) => {
        const u = await interaction.client.users.fetch(l.lenderId).catch(() => null);
        return `${i + 1}) ${u?.username ?? "usuário"}`;
      })
    );
    let label = `Pagar quem? ${nicks.join("  ")}`;
    if (label.length > 45) label = label.slice(0, 44) + "…";

    const modal = new ModalBuilder()
      .setCustomId(`banco:peer_pay_submit:_:${userId}`)
      .setTitle("Pagar Empréstimo Pessoal");
    const indexInput = new TextInputBuilder()
      .setCustomId("peer_index")
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(3)
      .setPlaceholder("1");
    const amountInput = new TextInputBuilder()
      .setCustomId("peer_amount")
      .setLabel("Quanto pagar")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10)
      .setPlaceholder(String(owed[0]!.totalOwed));
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(indexInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput)
    );
    await interaction.showModal(modal);
    return;
  }
}

export async function handleBancoModal(interaction: ModalSubmitInteraction, action: string, args: string[]) {
  // customId: banco:<action>:_:<ownerId>
  const userId = args[1];
  if (!userId) return;
  if (interaction.user.id !== userId) {
    await interaction.reply(
      v2EphemeralReply([errorContainer("Este não é o seu banco — use `/banco` para abrir o seu.")])
    );
    return;
  }

  if (action === "loan_submit") {
    const raw = interaction.fields.getTextInputValue("loan_amount");
    const amount = parseAmount(raw);

    if (amount === null || amount > MAX_LOAN_AMOUNT) {
      await interaction.reply(
        v2EphemeralReply([
          errorContainer(`Valor inválido. Digite um número entre 1 e ${fmt(MAX_LOAN_AMOUNT)}.`),
        ])
      );
      return;
    }

    const result = takeLoan(userId, amount);
    await interaction.update(renderEmprestimos(userId) as never);

    if (!result.ok) {
      const reason =
        result.reason === "locked"
          ? "Sua conta está bloqueada. Pague suas dívidas primeiro."
          : result.reason === "max_loans"
            ? "Você já tem o máximo de empréstimos ativos ao mesmo tempo."
            : `Valor inválido. Digite um número entre 1 e ${fmt(MAX_LOAN_AMOUNT)}.`;
      await toast(interaction, reason, false);
      return;
    }

    await toast(
      interaction,
      [
        `Você recebeu **${fmt(amount)} fichas**.`,
        `Total a devolver: **${fmt(result.loan.total)} fichas** em até ${LOAN_DUE_DAYS} dias.`,
      ].join("\n"),
      true
    );
    return;
  }

  if (action === "conv_submit") {
    const user = processAccount(userId);
    const raw = interaction.fields.getTextInputValue("conv_amount");
    const amount = parseAmount(raw);

    if (amount === null || amount > user.pendingInvites) {
      await interaction.reply(
        v2EphemeralReply([
          errorContainer(`Valor inválido. Você tem ${user.pendingInvites} invite(s) pendente(s).`),
        ])
      );
      return;
    }

    const result = convertInvites(userId, amount);
    await interaction.update(renderConversao(userId) as never);

    if (!result) {
      await toast(interaction, "Você não tem invites pendentes suficientes.", false);
      return;
    }

    await toast(
      interaction,
      `Você converteu **${result.converted} invites** em **${fmt(result.fichasEarned)} fichas**!`,
      true
    );
    return;
  }

  if (action === "inv_submit") {
    const user = processAccount(userId);
    const raw = interaction.fields.getTextInputValue("inv_amount");
    const amount = parseAmount(raw);

    if (amount === null || amount > user.fichas) {
      await interaction.reply(
        v2EphemeralReply([errorContainer(`Valor inválido. Você tem ${fmt(user.fichas)} ficha(s) disponível(is).`)])
      );
      return;
    }

    const result = investFichas(userId, amount);
    await interaction.update(renderInvestir(userId) as never);
    scheduleInvestAutoRefresh(interaction, userId);

    if (!result.ok) {
      const reason =
        result.reason === "locked"
          ? "Sua conta está bloqueada. Pague suas dívidas primeiro."
          : "Fichas insuficientes.";
      await toast(interaction, reason, false);
      return;
    }

    await toast(interaction, `Você investiu **${fmt(amount)} fichas**.`, true);
    return;
  }

  if (action === "sac_submit") {
    const user = processAccount(userId);
    const inv = user.investment;
    const raw = interaction.fields.getTextInputValue("sac_amount");
    const amount = parseAmount(raw);

    if (amount === null) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("Valor inválido. Digite um número válido.")])
      );
      return;
    }

    const result = withdrawPartial(userId, amount);
    await interaction.update(renderInvestir(userId) as never);
    if (result.ok && result.closed) {
      clearInvestAutoRefresh(interaction.message?.id);
    } else {
      scheduleInvestAutoRefresh(interaction, userId);
    }

    if (!result.ok) {
      const reason =
        result.reason === "not_active"
          ? "Você não tem nenhum investimento ativo."
          : result.reason === "negative_balance"
            ? "Seu investimento está negativo — encerre-o pelo botão Sacar para quitar."
            : `Valor inválido. Você tem ${fmt(inv.balance)} ficha(s) disponível(is) para saque.`;
      await toast(interaction, reason, false);
      return;
    }

    const msg = result.closed
      ? `Você sacou **${fmt(result.amount)} fichas** e encerrou o investimento.`
      : `Você sacou **${fmt(result.amount)} fichas**. Saldo restante investido: **${fmt(result.remainingBalance)} fichas**.`;
    await toast(interaction, msg, true);
    return;
  }

  if (action === "loan_pay_submit") {
    // customId: banco:loan_pay_submit:<origin>:<userId>
    const origin = args[0] === "carteira" ? "carteira" : "emprestimos";
    const scope = origin === "carteira" ? "all" : "bank";
    const index = parseAmount(interaction.fields.getTextInputValue("loan_index"));
    const amount = parseAmount(interaction.fields.getTextInputValue("loan_amount"));
    const render = origin === "carteira" ? renderCarteira : renderEmprestimos;

    if (index === null) {
      await interaction.reply(v2EphemeralReply([errorContainer("Número de dívida inválido.")]));
      return;
    }
    if (amount === null) {
      await interaction.reply(v2EphemeralReply([errorContainer("Valor inválido.")]));
      return;
    }

    const result = payLoanByIndex(userId, index, amount, scope);
    await interaction.update(render(userId) as never);

    if (!result.ok) {
      const reason =
        result.reason === "not_found"
          ? "Essa dívida não existe (confira o número na lista)."
          : result.reason === "insufficient"
            ? "Você não tem fichas suficientes."
            : "Valor inválido.";
      await toast(interaction, reason, false);
      return;
    }

    const msg = [
      `Você pagou **${fmt(result.paid)} fichas** dessa dívida.`,
      result.finished ? "Essa dívida foi quitada! ✅" : `Ainda falta **${fmt(result.remaining)} fichas** nela.`,
      result.unlocked ? "\n🔓 **Sua conta foi desbloqueada!**" : "",
    ]
      .filter(Boolean)
      .join("\n");
    await toast(interaction, msg, true);
    return;
  }

  if (action === "peer_pay_submit") {
    // customId: banco:peer_pay_submit:_:<userId>
    const index = parseAmount(interaction.fields.getTextInputValue("peer_index"));
    const amount = parseAmount(interaction.fields.getTextInputValue("peer_amount"));

    if (index === null) {
      await interaction.reply(v2EphemeralReply([errorContainer("Número inválido — confira a lista de quem você deve.")]));
      return;
    }
    if (amount === null) {
      await interaction.reply(v2EphemeralReply([errorContainer("Valor inválido.")]));
      return;
    }

    const owed = activePeerLoansAsBorrower(userId);
    const target = owed[index - 1];

    const result = payPeerLoanByIndex(userId, index, amount);
    await interaction.update(renderCarteira(userId) as never);

    if (!result.ok) {
      const reason =
        result.reason === "not_found"
          ? "Esse empréstimo não existe (confira o número na lista)."
          : result.reason === "not_active"
            ? "Esse empréstimo não está mais ativo."
            : result.reason === "insufficient"
              ? "Você não tem fichas suficientes."
              : "Valor inválido.";
      await toast(interaction, reason, false);
      return;
    }

    await toast(
      interaction,
      result.finished
        ? `Você pagou **${fmt(result.paid)} fichas** e quitou totalmente essa dívida.`
        : `Você pagou **${fmt(result.paid)} fichas**. Ainda falta **${fmt(result.remaining)} fichas**.`,
      true
    );

    if (target) {
      await interaction.client.users
        .fetch(target.lenderId)
        .then((lender) =>
          lender.send(
            v2Reply([
              successContainer(
                "Pagamento recebido!",
                `<@${userId}> te pagou **${fmt(result.paid)} fichas** do empréstimo pessoal. ${
                  result.finished ? "Dívida quitada!" : `Ainda falta ${fmt(result.remaining)} fichas.`
                }`
              ),
            ])
          )
        )
        .catch(() => null);
    }
    return;
  }
}
