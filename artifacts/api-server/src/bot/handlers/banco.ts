import {
  type ButtonInteraction,
  type ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import { errorContainer, successContainer, v2EphemeralReply } from "../v2/index";
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
  totalDebt,
  takeLoan,
  payDebts,
  convertInvites,
  investFichas,
  withdrawInvestment,
  withdrawPartial,
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

  // ── Empréstimos ────────────────────────────────────────────────────────────
  if (action === "loan") {
    if (arg === "pagar") {
      const user = processAccount(userId);
      const debt = totalDebt(user);
      const amount = Math.min(user.fichas, debt);

      if (debt <= 0) {
        await interaction.update(renderEmprestimos(userId) as never);
        await toast(interaction, "Você não tem dívidas para pagar.", false);
        return;
      }
      if (amount <= 0) {
        await interaction.update(renderEmprestimos(userId) as never);
        await toast(interaction, "Você não tem fichas suficientes para pagar nada agora.", false);
        return;
      }

      const result = payDebts(userId, amount);
      await interaction.update(renderEmprestimos(userId) as never);

      if (!result) {
        await toast(interaction, "Não foi possível processar o pagamento.", false);
        return;
      }

      const msg = [
        `Você pagou **${fmt(result.paid)} fichas** de dívida.`,
        result.remainingDebt > 0
          ? `Dívida restante: **${fmt(result.remainingDebt)} fichas**.`
          : "Todas as suas dívidas foram quitadas! ✅",
        result.unlocked ? "\n🔓 **Sua conta foi desbloqueada!**" : "",
      ]
        .filter(Boolean)
        .join("\n");
      await toast(interaction, msg, true);
      return;
    }
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
}
