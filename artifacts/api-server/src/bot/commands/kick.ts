import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import { modContainer, errorContainer, v2Reply, v2EphemeralReply, COLORS, EMOJIS } from "../v2/index";
import { IMMUNE_ROLE_ID } from "../config";

export const kickCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulsa um usuário do servidor")
    .addUserOption((opt) =>
      opt.setName("usuario").setDescription("Usuário a expulsar").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("motivo").setDescription("Motivo da expulsão").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const user = interaction.options.getUser("usuario", true);
    const motivo = interaction.options.getString("motivo") ?? "Sem motivo informado";

    if (user.id === interaction.user.id) {
      await interaction.reply(v2EphemeralReply([errorContainer("Você não pode se expulsar.")]));
      return;
    }

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await interaction.reply(v2EphemeralReply([errorContainer("Usuário não encontrado no servidor.")]));
      return;
    }

    if (member.roles.cache.has(IMMUNE_ROLE_ID)) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("Este usuário possui um cargo imune a punições.")])
      );
      return;
    }

    if (!member.kickable) {
      await interaction.reply(v2EphemeralReply([errorContainer("Não posso expulsar este usuário.")]));
      return;
    }

    await member
      .send(
        v2Reply([
          modContainer({
            action: `${EMOJIS.mod} Você foi expulso`,
            targetTag: user.tag,
            targetId: user.id,
            moderatorTag: interaction.user.tag,
            reason: motivo,
            avatarUrl: user.displayAvatarURL({ size: 256 }),
          }),
        ])
      )
      .catch(() => null);

    await member.kick(`[${interaction.user.tag}] ${motivo}`);

    await interaction.reply(
      v2Reply([
        modContainer({
          action: `${EMOJIS.mod} Usuário Expulso`,
          targetTag: user.tag,
          targetId: user.id,
          moderatorTag: interaction.user.tag,
          reason: motivo,
          avatarUrl: user.displayAvatarURL({ size: 256 }),
        }),
      ])
    );
  },
};
