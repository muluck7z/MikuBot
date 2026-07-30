import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { type BotCommand } from "../index";
import { successContainer, errorContainer, v2Reply, v2EphemeralReply } from "../v2/index";
import { adjustFichas } from "../economyStore";

// Único usuário autorizado a usar este comando, independente de cargos.
const AUTHORIZED_USER_ID = "1503230923980800150";

function fmt(n: number): string {
  return Math.round(Math.abs(n)).toLocaleString("pt-BR");
}

export const administrarSaldoCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("administrar-saldo")
    .setDescription("Adiciona ou remove fichas do saldo de um usuário (uso restrito)")
    .addUserOption((opt) =>
      opt.setName("usuario").setDescription("De quem é o saldo a ajustar").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("valor")
        .setDescription("Quantas fichas ajustar (use - para remover, ex: -500)")
        .setRequired(true)
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
      await interaction.reply(v2EphemeralReply([errorContainer("Você não pode ajustar o saldo de um bot.")]));
      return;
    }

    const result = adjustFichas(target.id, valor);

    if (!result.ok) {
      await interaction.reply(v2EphemeralReply([errorContainer("Valor inválido. Use um número diferente de 0.")]));
      return;
    }

    const isRemoval = result.delta < 0;

    await interaction.reply(
      v2Reply([
        successContainer(
          isRemoval ? "Saldo removido!" : "Fichas concedidas!",
          isRemoval
            ? `Você removeu **${fmt(result.delta)} fichas** de <@${target.id}>.\nSaldo atual dele(a): **${fmt(result.newBalance)} fichas**.`
            : `Você deu **${fmt(result.delta)} fichas** para <@${target.id}>.\nSaldo atual dele(a): **${fmt(result.newBalance)} fichas**.`
        ),
      ])
    );

    await target
      .send(
        v2Reply([
          successContainer(
            isRemoval ? "Seu saldo foi ajustado" : "Você recebeu fichas!",
            isRemoval
              ? `O banco removeu **${fmt(result.delta)} fichas** do seu saldo.`
              : `Você recebeu **${fmt(result.delta)} fichas** do banco.`
          ),
        ])
      )
      .catch(() => null);
  },
};
