import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { type BotCommand } from "../index";
import { successContainer, errorContainer, v2Reply, v2EphemeralReply } from "../v2/index";
import { transferFichas } from "../economyStore";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("pt-BR");
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
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const target = interaction.options.getUser("usuario", true);
    const valor = interaction.options.getInteger("valor", true);

    if (target.bot) {
      await interaction.reply(v2EphemeralReply([errorContainer("Você não pode transferir fichas para um bot.")]));
      return;
    }

    const result = transferFichas(interaction.user.id, target.id, valor);

    if (!result.ok) {
      const reason =
        result.reason === "same_user"
          ? "Você não pode transferir fichas para você mesmo."
          : result.reason === "locked"
            ? "Sua conta está bloqueada. Pague suas dívidas em `/banco` antes de transferir fichas."
            : result.reason === "insufficient"
              ? "Você não tem fichas suficientes para essa transferência."
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
