import { type ButtonInteraction } from "discord.js";
import { errorContainer, successContainer, v2EphemeralReply } from "../v2/index";
import {
  renderHome,
  renderEmprestimos,
  renderConversao,
  renderCarteira,
  renderInvestir,
} from "../bancoViews";
import {
  processAccount,
  totalDebt,
  takeLoan,
  payDebts,
  convertInvites,
  investFichas,
  withdrawInvestment,
  LOAN_DUE_DAYS,
  LOAN_AMOUNTS,
  CONVERT_AMOUNTS,
  INVEST_AMOUNTS,
} from "../economyStore";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

async function toast(interaction: ButtonInteraction, description: string, ok: boolean) {
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
    await interaction.update(renderHome(userId) as never);
    return;
  }
  if (action === "emprestimos") {
    await interaction.update(renderEmprestimos(userId) as never);
    return;
  }
  if (action === "conversao") {
    await interaction.update(renderConversao(userId) as never);
    return;
  }
  if (action === "carteira") {
    await interaction.update(renderCarteira(userId) as never);
    return;
  }
  if (action === "investir") {
    await interaction.update(renderInvestir(userId) as never);
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

    const amount = Number(arg);
    if (!LOAN_AMOUNTS.includes(amount as (typeof LOAN_AMOUNTS)[number])) return;

    const result = takeLoan(userId, amount);
    await interaction.update(renderEmprestimos(userId) as never);

    if (!result.ok) {
      const reason =
        result.reason === "locked"
          ? "Sua conta está bloqueada. Pague suas dívidas primeiro."
          : "Você já tem o máximo de empréstimos ativos ao mesmo tempo.";
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

  // ── Conversão ──────────────────────────────────────────────────────────────
  if (action === "conv") {
    const amount = Number(arg);
    if (!CONVERT_AMOUNTS.includes(amount as (typeof CONVERT_AMOUNTS)[number])) return;

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

  // ── Investir ───────────────────────────────────────────────────────────────
  if (action === "inv") {
    if (arg === "sacar") {
      const result = withdrawInvestment(userId);
      await interaction.update(renderInvestir(userId) as never);

      if (!result.ok) {
        await toast(interaction, "Você não tem nenhum investimento ativo.", false);
        return;
      }

      const msg =
        result.amount >= 0
          ? `Você sacou **${fmt(result.amount)} fichas** do seu investimento.`
          : `Seu investimento fechou negativo. Você ficou devendo **${fmt(Math.abs(result.amount))} fichas**.`;
      await toast(interaction, msg, result.amount >= 0);
      return;
    }

    const amount = Number(arg);
    if (!INVEST_AMOUNTS.includes(amount as (typeof INVEST_AMOUNTS)[number])) return;

    const result = investFichas(userId, amount);
    await interaction.update(renderInvestir(userId) as never);

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
}
