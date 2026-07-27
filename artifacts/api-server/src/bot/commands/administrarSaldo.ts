import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { type BotCommand } from "../index";
import { successContainer, errorContainer, v2Reply, v2EphemeralReply } from "../v2/index";
import { giveFichas } from "../economyStore";

// Único usuário autorizado a usar este comando, independente de cargos.
const AUTHORIZED_USER_ID = "1503230923980800150";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

export const administrarSaldoCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("administrar-saldo")
    .setDescription("Adiciona ou remove fichas de um usuário (uso restrito)")
    .addUserOption((opt) =>
      opt.setName("usuario").setDescription("Usuário alvo").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("valor").setDescription("Valor a adicionar (positivo) ou remover (negativo)").setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.user.id !== AUTHORIZED_USER_ID) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("Você não tem permissão para usar este comando.")])
      );
      return;
    }

    const target = interaction.options.getUser("usuario", true);
    const valor = interaction.options.getInteger("valor", true);

    if (target.bot) {
      await interaction.reply(v2EphemeralReply([errorContainer("Você não pode administrar o saldo de um bot.")]));
      return;
    }

    const result = giveFichas(target.id, valor);

    if (!result.ok) {
      await interaction.reply(v2EphemeralReply([errorContainer("Ocorreu um erro ao processar o valor.")]));
      return;
    }

    const isAdding = valor >= 0;
    const title = isAdding ? "Saldo adicionado!" : "Saldo removido!";
    const actionText = isAdding ? "deu" : "removeu";
    const notifyText = isAdding ? "recebeu" : "perdeu";

    await interaction.reply(
      v2Reply([
        successContainer(
          title,
          `Você ${actionText} **${fmt(Math.abs(valor))} fichas** para <@${target.id}>.\nSaldo atual dele(a): **${fmt(result.newBalance)} fichas**.`
        ),
      ])
    );

    await target
      .send(
        v2Reply([
          successContainer(
            title,
            `Você ${notifyText} **${fmt(Math.abs(valor))} fichas** do banco.`
          ),
        ])
      )
      .catch(() => null);
  },
};
