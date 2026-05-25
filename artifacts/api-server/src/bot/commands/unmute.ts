import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import { modContainer, errorContainer, v2Reply, v2EphemeralReply, COLORS, EMOJIS } from "../v2/index";

export const unmuteCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Remove o silenciamento de um usuário")
    .addUserOption((opt) =>
      opt.setName("usuario").setDescription("Usuário a dessilenciar").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("motivo").setDescription("Motivo").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const user = interaction.options.getUser("usuario", true);
    const motivo = interaction.options.getString("motivo") ?? "Sem motivo informado";

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await interaction.reply(v2EphemeralReply([errorContainer("Usuário não encontrado no servidor.")]));
      return;
    }

    if (!member.isCommunicationDisabled()) {
      await interaction.reply(v2EphemeralReply([errorContainer("Este usuário não está silenciado.")]));
      return;
    }

    await member.timeout(null, `[${interaction.user.tag}] ${motivo}`);

    await interaction.reply(
      v2Reply([
        modContainer({
          action: `${EMOJIS.mod} Usuário Dessilenciado`,
          targetTag: user.tag,
          targetId: user.id,
          moderatorTag: interaction.user.tag,
          reason: motivo,
          avatarUrl: user.displayAvatarURL({ size: 256 }),
          accentColor: COLORS.unmute,
        }),
      ])
    );
  },
};
