import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { type BotCommand } from "../index";
import {
  successContainer,
  errorContainer,
  infoContainer,
  successButton,
  dangerButton,
  row,
  v2Reply,
  v2EphemeralReply,
} from "../v2/index";
import { transferFichas, createPeerLoan, DEBT_TRANSFER_MAX_AMOUNT, PEER_LOAN_DUE_DAYS } from "../economyStore";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

/** Monta o customId dos botões de aceitar/recusar enviados na DM. */
function peerLoanButtonId(action: "accept" | "decline", loanId: string): string {
  return `pemp:${action}:${loanId}`;
}

export const pixCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("pix")
    .setDescription("Transfere fichas para outro usuário")
    .addUserOption((opt) =>
      opt.setName("usuario").setDescription("Para quem você quer transferir").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("valor").setDescription("Quantas fichas transferir").setMinValue(1).setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("emprestimo")
        .setDescription("É um empréstimo (com taxa de retorno) em vez de uma transferência normal?")
        .addChoices({ name: "Sim", value: "sim" }, { name: "Não", value: "nao" })
        .setRequired(false)
    )
    .addNumberOption((opt) =>
      opt
        .setName("taxa")
        .setDescription("Só para empréstimos: % que ele deve te devolver a mais (ex: 20 = 20%)")
        .setMinValue(0)
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const target = interaction.options.getUser("usuario", true);
    const valor = interaction.options.getInteger("valor", true);
    const emprestimoOpt = interaction.options.getString("emprestimo");
    const taxaOpt = interaction.options.getNumber("taxa");
    const isEmprestimo = emprestimoOpt === "sim";

    if (target.bot) {
      await interaction.reply(v2EphemeralReply([errorContainer("Você não pode transferir fichas para um bot.")]));
      return;
    }

    if (target.id === interaction.user.id) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("Você não pode transferir fichas para você mesmo.")])
      );
      return;
    }

    // ─── Empréstimo entre usuários ───────────────────────────────────────────
    if (isEmprestimo) {
      if (taxaOpt === null || taxaOpt < 0) {
        await interaction.reply(
          v2EphemeralReply([
            errorContainer("Informe uma **taxa** válida (%) para o empréstimo — ex: `20` para 20%."),
          ])
        );
        return;
      }

      const result = createPeerLoan(interaction.user.id, target.id, valor, taxaOpt);

      if (!result.ok) {
        const reason =
          result.reason === "same_user"
            ? "Você não pode emprestar fichas para você mesmo."
            : result.reason === "locked"
              ? "Sua conta está bloqueada. Pague suas dívidas em `/banco` antes de emprestar fichas."
              : result.reason === "insufficient"
                ? "Você não tem fichas suficientes para esse empréstimo."
                : result.reason === "invalid_rate"
                  ? "Taxa inválida."
                  : "Valor inválido.";
        await interaction.reply(v2EphemeralReply([errorContainer(reason)]));
        return;
      }

      const loan = result.loan;

      await interaction.reply(
        v2Reply([
          successContainer(
            "Pedido de empréstimo enviado!",
            `Você ofereceu **${fmt(loan.amount)} fichas** para <@${target.id}> com taxa de **${loan.ratePct}%** ` +
              `(ele teria que te devolver **${fmt(loan.totalOwed)} fichas** em até ${PEER_LOAN_DUE_DAYS} dias). ` +
              `As fichas ficaram retidas até ele responder pela DM.`
          ),
        ])
      );

      const dmPayload = v2Reply(
        [
          infoContainer({
            title: "📩 Pedido de empréstimo",
            description:
              `<@${interaction.user.id}> quer te emprestar **${fmt(loan.amount)} fichas**.\n\n` +
              `Se você aceitar, terá até **${PEER_LOAN_DUE_DAYS} dias** para devolver **${fmt(
                loan.totalOwed
              )} fichas** (taxa de ${loan.ratePct}%) diretamente para ele.\n` +
              `Se passar do prazo sem pagar tudo, o que faltar vira uma dívida oficial no banco em seu nome.`,
          }),
        ],
        {
          buttons: [
            row(
              successButton(peerLoanButtonId("accept", loan.id), "Aceitar"),
              dangerButton(peerLoanButtonId("decline", loan.id), "Recusar")
            ),
          ],
        }
      );

      await target.send(dmPayload).catch(async () => {
        // Não foi possível enviar DM (ex: DMs fechadas) — avisa quem emprestou.
        await interaction
          .followUp(
            v2EphemeralReply([
              errorContainer(
                `Não consegui enviar a DM para <@${target.id}> (DMs fechadas?). ` +
                  `Peça pra ele liberar as DMs ou tente novamente — as fichas continuam retidas até ele responder.`
              ),
            ])
          )
          .catch(() => null);
      });
      return;
    }

    // ─── Transferência normal ────────────────────────────────────────────────
    const result = transferFichas(interaction.user.id, target.id, valor);

    if (!result.ok) {
      const reason =
        result.reason === "same_user"
          ? "Você não pode transferir fichas para você mesmo."
          : result.reason === "locked"
            ? "Sua conta está bloqueada. Pague suas dívidas em `/banco` antes de transferir fichas."
            : result.reason === "insufficient"
              ? "Você não tem fichas suficientes para essa transferência."
              : result.reason === "debt_amount_too_high"
                ? `Enquanto você tiver dívidas de empréstimo, só pode transferir menos de **${fmt(DEBT_TRANSFER_MAX_AMOUNT)} fichas** por vez.`
                : result.reason === "debt_cooldown"
                  ? `Enquanto você tiver dívidas de empréstimo, só pode fazer **1 transferência por dia**. Tente novamente <t:${Math.ceil(
                      (result.retryAt ?? Date.now()) / 1000
                    )}:R>.`
                  : "Valor inválido.";
      await interaction.reply(v2EphemeralReply([errorContainer(reason)]));
      return;
    }

    await interaction.reply(
      v2Reply([
        successContainer(
          "Pix enviado!",
          `Você transferiu **${fmt(result.amount)} fichas** para <@${target.id}>.`
        ),
      ])
    );

    await target
      .send(
        v2Reply([
          successContainer(
            "Você recebeu um Pix!",
            `<@${interaction.user.id}> transferiu **${fmt(result.amount)} fichas** para você.`
          ),
        ])
      )
      .catch(() => null);
  },
};
