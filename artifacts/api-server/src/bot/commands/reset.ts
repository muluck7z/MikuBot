import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { type BotCommand } from "../index";
import { infoContainer, errorContainer, dangerButton, secondaryButton, row, v2Reply, v2EphemeralReply } from "../v2/index";

// Único usuário autorizado a usar este comando, independente de cargos.
const AUTHORIZED_USER_ID = "1503230923980800150";

export const resetCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("reset")
    .setDescription("[Restrito] Reseta TODA a economia do servidor do zero"),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.user.id !== AUTHORIZED_USER_ID) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("Você não tem permissão para usar este comando.")])
      );
      return;
    }

    const description = [
      "Isso vai **apagar permanentemente** de todos os usuários:",
      "> Fichas, dívidas e empréstimos",
      "> Saldo em Investimento (todas as salas)",
      "> Banca de Roleta, Aviator e Mines",
      "> Itens do inventário e boosts ativos",
      "",
      "E também vai **reverter todos os invites**, fazendo a conversão de invites em fichas ser refeita do zero na próxima sincronização.",
      "",
      "**Essa ação não pode ser desfeita.** Tem certeza?",
    ].join("\n");

    await interaction.reply(
      v2Reply([infoContainer({ title: "⚠️ Reset Total da Economia", description })], {
        ephemeral: true,
        buttons: [
          row(
            dangerButton(`reset:confirmar:_:${interaction.user.id}`, "Confirmar Reset"),
            secondaryButton(`reset:cancelar:_:${interaction.user.id}`, "Cancelar")
          ),
        ],
      }) as never
    );
  },
};
