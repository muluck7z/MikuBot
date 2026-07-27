import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { type BotCommand } from "../index";
import { successContainer, errorContainer, v2Reply, v2EphemeralReply } from "../v2/index";
import { setEconomyBlock, isEconomyBlocked } from "../economyStore";

// Único usuário autorizado a usar este comando, independente de cargos.
const AUTHORIZED_USER_ID = "1503230923980800150";

export const bloquearContasCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("bloquear-contas")
    .setDescription("Bloqueia ou desbloqueia um usuário do sistema de economia (uso restrito)")
    .addUserOption((opt) =>
      opt.setName("usuario").setDescription("Qual usuário bloquear/desbloquear").setRequired(true)
    )
    .addBooleanOption((opt) =>
      opt
        .setName("bloquear")
        .setDescription("true para bloquear, false para desbloquear (padrão: true)")
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.user.id !== AUTHORIZED_USER_ID) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("Você não tem permissão para usar este comando.")])
      );
      return;
    }

    const target = interaction.options.getUser("usuario", true);
    const blocked = interaction.options.getBoolean("bloquear") ?? true;

    if (target.bot) {
      await interaction.reply(v2EphemeralReply([errorContainer("Você não pode bloquear um bot.")]));
      return;
    }

    if (target.id === AUTHORIZED_USER_ID && blocked) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("Você não pode bloquear a si mesmo.")])
      );
      return;
    }

    const alreadySet = isEconomyBlocked(target.id) === blocked;
    setEconomyBlock(target.id, blocked);

    await interaction.reply(
      v2Reply([
        successContainer(
          blocked ? "Usuário bloqueado!" : "Usuário desbloqueado!",
          blocked
            ? `<@${target.id}> foi bloqueado(a) e não pode mais interagir com nenhum comando de economia (\`/banco\`, \`/pix\`, \`/cassino\`, \`/negocios\`) até ser desbloqueado(a).${alreadySet ? "\n(já estava bloqueado(a))" : ""}`
            : `<@${target.id}> foi desbloqueado(a) e voltou a poder usar os comandos de economia normalmente.${alreadySet ? "\n(já estava desbloqueado(a))" : ""}`
        ),
      ])
    );
  },
};
