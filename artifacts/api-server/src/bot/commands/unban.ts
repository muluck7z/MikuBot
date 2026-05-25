import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import { modContainer, errorContainer, v2Reply, v2EphemeralReply, COLORS, EMOJIS } from "../v2/index";

export const unbanCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Remove o banimento de um usuário")
    .addStringOption((opt) =>
      opt.setName("userid").setDescription("ID do usuário a ser desbanido").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("motivo").setDescription("Motivo do desbanimento").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const userId = interaction.options.getString("userid", true);
    const motivo = interaction.options.getString("motivo") ?? "Sem motivo informado";

    const ban = await guild.bans.fetch(userId).catch(() => null);
    if (!ban) {
      await interaction.reply(v2EphemeralReply([errorContainer("Este usuário não está banido.")]));
      return;
    }

    await guild.bans.remove(userId, `[${interaction.user.tag}] ${motivo}`);

    await interaction.reply(
      v2Reply([
        modContainer({
          action: `${EMOJIS.mod} Usuário Desbanido`,
          targetTag: ban.user.tag,
          targetId: ban.user.id,
          moderatorTag: interaction.user.tag,
          reason: motivo,
          avatarUrl: ban.user.displayAvatarURL({ size: 256 }),
          accentColor: COLORS.unban,
        }),
      ])
    );
  },
};
