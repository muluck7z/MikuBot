import {
  type ButtonInteraction,
  type ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import {
  successContainer,
  errorContainer,
  secondaryButton,
  row,
  v2Reply,
  v2EphemeralReply,
} from "../v2/index";
import { getPeerLoan, respondPeerLoan, payPeerLoan, PEER_LOAN_DUE_DAYS } from "../economyStore";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

function peerLoanCustomId(action: string, loanId: string): string {
  return `pemp:${action}:${loanId}`;
}

/**
 * Botões "Aceitar" / "Recusar" (enviados por DM ao pedir um empréstimo) e
 * "Pagar" (que abre o modal de pagamento). Funciona em DM, fora de servidores.
 */
export async function handlePeerLoanButton(interaction: ButtonInteraction) {
  const [, action, loanId] = interaction.customId.split(":");
  if (!loanId) return;

  const loan = getPeerLoan(loanId);
  if (!loan) {
    await interaction
      .reply(v2EphemeralReply([errorContainer("Este pedido de empréstimo não existe mais.")]))
      .catch(() => null);
    return;
  }

  if (action === "accept" || action === "decline") {
    if (loan.borrowerId !== interaction.user.id) {
      await interaction
        .reply(v2EphemeralReply([errorContainer("Esse pedido de empréstimo não é seu.")]))
        .catch(() => null);
      return;
    }
    if (loan.status !== "pending") {
      await interaction
        .reply(v2EphemeralReply([errorContainer("Esse pedido já foi respondido.")]))
        .catch(() => null);
      return;
    }

    const accept = action === "accept";
    const result = respondPeerLoan(loanId, interaction.user.id, accept);
    if (!result.ok) {
      await interaction
        .reply(v2EphemeralReply([errorContainer("Não foi possível processar sua resposta.")]))
        .catch(() => null);
      return;
    }

    if (accept) {
      await interaction
        .update(
          v2Reply(
            [
              successContainer(
                "Empréstimo aceito!",
                `Você recebeu **${fmt(loan.amount)} fichas** de <@${loan.lenderId}>. ` +
                  `Você tem até **${PEER_LOAN_DUE_DAYS} dias** para devolver **${fmt(
                    loan.totalOwed
                  )} fichas** a ele — pode pagar quando quiser, aos poucos ou de uma vez.`
              ),
            ],
            { buttons: [row(secondaryButton(peerLoanCustomId("pay_open", loan.id), "Pagar"))] }
          )
        )
        .catch(() => null);

      await interaction.client.users
        .fetch(loan.lenderId)
        .then((lender) =>
          lender.send(
            v2Reply([
              successContainer(
                "Empréstimo aceito!",
                `<@${loan.borrowerId}> aceitou seu empréstimo de **${fmt(loan.amount)} fichas** e agora deve te ` +
                  `devolver **${fmt(loan.totalOwed)} fichas** em até ${PEER_LOAN_DUE_DAYS} dias.`
              ),
            ])
          )
        )
        .catch(() => null);
    } else {
      await interaction
        .update(
          v2Reply([
            errorContainer(
              `Você recusou o empréstimo de <@${loan.lenderId}>. As **${fmt(loan.amount)} fichas** foram devolvidas a ele.`
            ),
          ])
        )
        .catch(() => null);

      await interaction.client.users
        .fetch(loan.lenderId)
        .then((lender) =>
          lender.send(
            v2Reply([
              errorContainer(
                `<@${loan.borrowerId}> recusou seu empréstimo. As **${fmt(loan.amount)} fichas** voltaram para sua carteira.`
              ),
            ])
          )
        )
        .catch(() => null);
    }
    return;
  }

  if (action === "pay_open") {
    if (loan.borrowerId !== interaction.user.id) {
      await interaction.reply(v2EphemeralReply([errorContainer("Esse empréstimo não é seu.")])).catch(() => null);
      return;
    }
    if (loan.status !== "active") {
      await interaction
        .reply(v2EphemeralReply([errorContainer("Esse empréstimo não está mais ativo.")]))
        .catch(() => null);
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(peerLoanCustomId("pay_submit", loan.id))
      .setTitle("Pagar empréstimo");
    const input = new TextInputBuilder()
      .setCustomId("valor")
      .setLabel(`Quanto pagar (falta ${fmt(loan.totalOwed)})`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(String(loan.totalOwed))
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
    return;
  }
}

/** Envio do modal de pagamento (customId `pemp:pay_submit:<loanId>`). */
export async function handlePeerLoanModal(
  interaction: ModalSubmitInteraction,
  action: string,
  args: string[]
) {
  if (action !== "pay_submit") return;
  const loanId = args[0];
  if (!loanId) return;

  const loan = getPeerLoan(loanId);
  if (!loan) {
    await interaction.reply(v2EphemeralReply([errorContainer("Este empréstimo não existe mais.")])).catch(() => null);
    return;
  }

  const raw = interaction.fields.getTextInputValue("valor").trim().replace(",", ".");
  const valor = Math.floor(Number(raw));

  if (!Number.isFinite(valor) || valor < 1) {
    await interaction.reply(v2EphemeralReply([errorContainer("Valor inválido.")])).catch(() => null);
    return;
  }

  const result = payPeerLoan(loanId, interaction.user.id, valor);
  if (!result.ok) {
    const reason =
      result.reason === "not_yours"
        ? "Esse empréstimo não é seu."
        : result.reason === "not_active"
          ? "Esse empréstimo não está mais ativo (já foi pago ou virou dívida no banco)."
          : result.reason === "insufficient"
            ? "Você não tem fichas suficientes."
            : result.reason === "not_found"
              ? "Este empréstimo não existe mais."
              : "Valor inválido.";
    await interaction.reply(v2EphemeralReply([errorContainer(reason)])).catch(() => null);
    return;
  }

  await interaction.reply(
    v2Reply([
      successContainer(
        result.finished ? "Empréstimo quitado!" : "Pagamento enviado!",
        result.finished
          ? `Você pagou **${fmt(result.paid)} fichas** e quitou totalmente sua dívida com <@${loan.lenderId}>.`
          : `Você pagou **${fmt(result.paid)} fichas** para <@${loan.lenderId}>. Ainda falta **${fmt(
              result.remaining
            )} fichas**.`
      ),
    ])
  );

  await interaction.client.users
    .fetch(loan.lenderId)
    .then((lender) =>
      lender.send(
        v2Reply([
          successContainer(
            "Pagamento recebido!",
            `<@${loan.borrowerId}> te pagou **${fmt(result.paid)} fichas** do empréstimo pessoal. ${
              result.finished ? "Dívida quitada!" : `Ainda falta ${fmt(result.remaining)} fichas.`
            }`
          ),
        ])
      )
    )
    .catch(() => null);
}
