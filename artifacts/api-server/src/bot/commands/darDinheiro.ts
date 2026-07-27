import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { type BotCommand } from "../index";
import { successContainer, errorContainer, v2Reply, v2EphemeralReply } from "../v2/index";
import { giveFichas } from "../economyStore";

// Único usuário autorizado a usar este comando, independente de cargos.
const AUTHORIZED_USER_ID = "1503230923980800150";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
}

export const darDinheiroCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("dar-dinheiro")
    .setDescription("Dá fichas a um usuário (uso restrito)")
    .addUserOption((opt) =>
      opt.setName("usuario").setDescription("Quem vai receber as fichas").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName("valor").setDescription("Quantas fichas dar").setMinValue(1).setRequired(true)
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
      await interaction.reply(v2EphemeralReply([errorContainer("Você não pode dar fichas a um bot.")]));
      return;
    }

    const result = giveFichas(target.id, valor);

    if (!result.ok) {
      await interaction.reply(v2EphemeralReply([errorContainer("Valor inválido.")]));
      return;
    }

    await interaction.reply(
      v2Reply([
        successContainer(
          "Fichas concedidas!",
          `Você deu **${fmt(result.amount)} fichas** para <@${target.id}>.\nSaldo atual dele(a): **${fmt(result.newBalance)} fichas**.`
        ),
      ])
    );

    await target
      .send(
        v2Reply([
          successContainer(
            "Você recebeu fichas!",
            `Você recebeu **${fmt(result.amount)} fichas** do banco.`
          ),
        ])
      )
      .catch(() => null);
  },
};
