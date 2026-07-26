import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import {
  successContainer,
  errorContainer,
  infoContainer,
  v2Reply,
  v2EphemeralReply,
  COLORS,
} from "../v2/index";
import {
  getUser,
  convertInvites,
  transfer,
  takeLoan,
  payLoan,
  invest,
  collectMaturedInvestments,
  INVESTMENT_OPTIONS,
} from "../economyStore";

export const bancoCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("banco")
    .setDescription("Sistema bancário de fichas do servidor")

    // /banco carteira
    .addSubcommand((sub) =>
      sub
        .setName("carteira")
        .setDescription("Veja seu saldo, invites pendentes, dívidas e investimentos")
    )

    // /banco converter
    .addSubcommand((sub) =>
      sub
        .setName("converter")
        .setDescription("Converta seus invites em fichas (1 invite = 20 fichas)")
    )

    // /banco transferir
    .addSubcommand((sub) =>
      sub
        .setName("transferir")
        .setDescription("Envie fichas para outro usuário")
        .addUserOption((opt) =>
          opt
            .setName("usuario")
            .setDescription("Usuário que receberá as fichas")
            .setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("quantidade")
            .setDescription("Quantidade de fichas a enviar")
            .setRequired(true)
            .setMinValue(1)
        )
    )

    // /banco investir
    .addSubcommand((sub) =>
      sub
        .setName("investir")
        .setDescription("Invista suas fichas e ganhe rendimento com o tempo")
        .addIntegerOption((opt) =>
          opt
            .setName("quantidade")
            .setDescription("Quantidade de fichas a investir (mínimo 100)")
            .setRequired(true)
            .setMinValue(100)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("opcao")
            .setDescription("Modalidade de investimento")
            .setRequired(true)
            .addChoices(
              { name: "12 horas — 10% de retorno", value: 0 },
              { name: "24 horas — 20% de retorno", value: 1 },
              { name: "72 horas — 50% de retorno", value: 2 }
            )
        )
    )

    // /banco emprestimo (grupo)
    .addSubcommandGroup((group) =>
      group
        .setName("emprestimo")
        .setDescription("Gerenciar empréstimos de fichas")
        .addSubcommand((sub) =>
          sub
            .setName("pegar")
            .setDescription("Solicite um empréstimo de fichas (30% de juros, prazo de 7 dias)")
            .addIntegerOption((opt) =>
              opt
                .setName("quantidade")
                .setDescription("Quantidade de fichas a pedir emprestado")
                .setRequired(true)
                .setMinValue(10)
                .setMaxValue(2000)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("pagar")
            .setDescription("Pague seu empréstimo mais antigo em aberto")
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub   = interaction.options.getSubcommand();

    // ── /banco carteira ───────────────────────────────────────────────────────
    if (sub === "carteira") {
      const collected = collectMaturedInvestments(interaction.user.id);
      const user = getUser(interaction.user.id);

      const activeLoans = user.loans.filter((l) => !l.paid);
      const pendingInvs = user.investments.filter(
        (i) => !i.collected && i.matureAt > Date.now()
      );

      const lines: string[] = [];

      lines.push(`💰 **Fichas:** ${user.fichas}`);
      lines.push(`📩 **Invites pendentes:** ${user.pendingInvites} (use \`/banco converter\`)`);

      if (collected > 0) {
        lines.push(`\n✅ **Investimentos coletados agora:** +${collected} fichas`);
      }

      // Dívidas
      if (activeLoans.length > 0) {
        lines.push(`\n📋 **Dívidas ativas (${activeLoans.length}):**`);
        for (const loan of activeLoans) {
          const overdue = loan.dueAt < Date.now();
          const dueStr  = `<t:${Math.floor(loan.dueAt / 1000)}:R>`;
          lines.push(
            `• ID \`${loan.id}\` — **${loan.total} fichas** ${
              overdue ? "⚠️ **VENCIDA**" : `(vence ${dueStr})`
            }`
          );
        }
      } else {
        lines.push("\n✅ **Sem dívidas ativas**");
      }

      // Investimentos em andamento
      if (pendingInvs.length > 0) {
        lines.push(`\n📈 **Investimentos em andamento (${pendingInvs.length}):**`);
        for (const inv of pendingInvs) {
          const readyStr = `<t:${Math.floor(inv.matureAt / 1000)}:R>`;
          lines.push(
            `• ${inv.amount} fichas → **${inv.returnAmount} fichas** (pronto ${readyStr})`
          );
        }
      }

      await interaction.reply(
        v2EphemeralReply([
          infoContainer({
            title: "💳 Sua Carteira",
            description: lines.join("\n"),
            accentColor: COLORS.info,
          }),
        ])
      );
      return;
    }

    // ── /banco converter ──────────────────────────────────────────────────────
    if (sub === "converter") {
      const result = convertInvites(interaction.user.id);
      if (!result) {
        await interaction.reply(
          v2EphemeralReply([
            errorContainer(
              "Você não tem invites pendentes para converter.\n" +
              "Cada vez que alguém entra no servidor usando seu link de convite, você ganha 1 invite."
            ),
          ])
        );
        return;
      }

      const user = getUser(interaction.user.id);
      await interaction.reply(
        v2EphemeralReply([
          successContainer(
            "Conversão realizada!",
            [
              `Você converteu **${result.converted} invite${result.converted > 1 ? "s" : ""}** em **${result.fichasEarned} fichas**!`,
              `💰 **Novo saldo:** ${user.fichas} fichas`,
            ].join("\n")
          ),
        ])
      );
      return;
    }

    // ── /banco transferir ─────────────────────────────────────────────────────
    if (sub === "transferir") {
      const target   = interaction.options.getUser("usuario", true);
      const amount   = interaction.options.getInteger("quantidade", true);

      if (target.id === interaction.user.id) {
        await interaction.reply(
          v2EphemeralReply([errorContainer("Você não pode transferir fichas para si mesmo.")])
        );
        return;
      }
      if (target.bot) {
        await interaction.reply(
          v2EphemeralReply([errorContainer("Você não pode transferir fichas para um bot.")])
        );
        return;
      }

      const ok = transfer(interaction.user.id, target.id, amount);
      if (!ok) {
        const user = getUser(interaction.user.id);
        await interaction.reply(
          v2EphemeralReply([
            errorContainer(
              `Fichas insuficientes.\n**Seu saldo:** ${user.fichas} fichas | **Necessário:** ${amount} fichas`
            ),
          ])
        );
        return;
      }

      const sender   = getUser(interaction.user.id);
      const receiver = getUser(target.id);
      await interaction.reply(
        v2Reply([
          successContainer(
            "Transferência realizada!",
            [
              `**${interaction.user.username}** enviou **${amount} fichas** para <@${target.id}>.`,
              `💰 Saldo de ${interaction.user.username}: ${sender.fichas} fichas`,
              `💰 Saldo de ${target.username}: ${receiver.fichas} fichas`,
            ].join("\n")
          ),
        ])
      );
      return;
    }

    // ── /banco investir ───────────────────────────────────────────────────────
    if (sub === "investir") {
      const amount      = interaction.options.getInteger("quantidade", true);
      const optionIndex = interaction.options.getInteger("opcao", true);

      // Coleta investimentos vencidos antes de verificar saldo
      collectMaturedInvestments(interaction.user.id);

      const user = getUser(interaction.user.id);
      if (user.fichas < amount) {
        await interaction.reply(
          v2EphemeralReply([
            errorContainer(
              `Fichas insuficientes.\n**Seu saldo:** ${user.fichas} fichas | **Necessário:** ${amount} fichas`
            ),
          ])
        );
        return;
      }

      const option = INVESTMENT_OPTIONS[optionIndex];
      if (!option) {
        await interaction.reply(
          v2EphemeralReply([errorContainer("Opção de investimento inválida.")])
        );
        return;
      }

      const investment = invest(interaction.user.id, amount, optionIndex);
      if (!investment) {
        await interaction.reply(
          v2EphemeralReply([errorContainer("Não foi possível realizar o investimento. Tente novamente.")])
        );
        return;
      }

      const readyStr = `<t:${Math.floor(investment.matureAt / 1000)}:F>`;
      await interaction.reply(
        v2EphemeralReply([
          successContainer(
            "Investimento realizado!",
            [
              `📊 **Valor investido:** ${amount} fichas`,
              `💰 **Retorno esperado:** ${investment.returnAmount} fichas (+${Math.round(option.rate * 100)}%)`,
              `⏰ **Disponível em:** ${readyStr}`,
              "",
              "Use `/banco carteira` para acompanhar seus investimentos.",
            ].join("\n")
          ),
        ])
      );
      return;
    }

    // ── /banco emprestimo pegar ───────────────────────────────────────────────
    if (group === "emprestimo" && sub === "pegar") {
      const amount = interaction.options.getInteger("quantidade", true);
      const user   = getUser(interaction.user.id);
      const activeLoans = user.loans.filter((l) => !l.paid);

      if (activeLoans.length >= 2) {
        await interaction.reply(
          v2EphemeralReply([
            errorContainer(
              `Você já tem **${activeLoans.length} empréstimos ativos**. Pague pelo menos um antes de solicitar outro.\n` +
              "Use `/banco emprestimo pagar` para quitar seu débito mais antigo."
            ),
          ])
        );
        return;
      }

      const loan = takeLoan(interaction.user.id, amount);
      const dueStr = `<t:${Math.floor(loan.dueAt / 1000)}:F>`;

      await interaction.reply(
        v2EphemeralReply([
          successContainer(
            "Empréstimo concedido!",
            [
              `Você recebeu **${amount} fichas** na sua carteira.`,
              `💸 **Total a devolver:** ${loan.total} fichas (30% de juros)`,
              `📅 **Prazo:** ${dueStr}`,
              `🔖 **ID:** \`${loan.id}\``,
              "",
              "Use `/banco emprestimo pagar` quando quiser quitar o débito.",
            ].join("\n")
          ),
        ])
      );
      return;
    }

    // ── /banco emprestimo pagar ───────────────────────────────────────────────
    if (group === "emprestimo" && sub === "pagar") {
      const user = getUser(interaction.user.id);
      const unpaid = user.loans
        .filter((l) => !l.paid)
        .sort((a, b) => a.takenAt - b.takenAt);

      if (unpaid.length === 0) {
        await interaction.reply(
          v2EphemeralReply([
            successContainer("Sem dívidas!", "Você não tem empréstimos ativos para pagar."),
          ])
        );
        return;
      }

      const loan = unpaid[0]!;
      if (user.fichas < loan.total) {
        await interaction.reply(
          v2EphemeralReply([
            errorContainer(
              `Fichas insuficientes para pagar o empréstimo.\n` +
              `**Necessário:** ${loan.total} fichas | **Seu saldo:** ${user.fichas} fichas`
            ),
          ])
        );
        return;
      }

      const result = payLoan(interaction.user.id, loan.id);
      if (result !== "ok") {
        await interaction.reply(
          v2EphemeralReply([errorContainer("Ocorreu um erro ao processar o pagamento. Tente novamente.")])
        );
        return;
      }

      const remaining = user.loans.filter((l) => !l.paid).length;
      await interaction.reply(
        v2EphemeralReply([
          successContainer(
            "Empréstimo pago!",
            [
              `Você pagou **${loan.total} fichas** e quitou o débito \`${loan.id}\`.`,
              `💰 **Saldo atual:** ${user.fichas} fichas`,
              remaining > 0
                ? `\n📋 Você ainda tem **${remaining} empréstimo${remaining > 1 ? "s" : ""}** ativo${remaining > 1 ? "s" : ""}.`
                : "\n✅ Todos os seus empréstimos foram quitados!",
            ].join("\n")
          ),
        ])
      );
      return;
    }
  },
};
