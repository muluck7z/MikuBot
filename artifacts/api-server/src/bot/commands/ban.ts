import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import {
  modContainer,
  errorContainer,
  v2Reply,
  v2EphemeralReply,
  COLORS,
  EMOJIS,
} from "../v2/index";
import { IMMUNE_ROLE_ID } from "../config";

export const banCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Bane um usuário do servidor")
    .addUserOption((opt) =>
      opt.setName("usuario").setDescription("Usuário a ser banido").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("motivo").setDescription("Motivo do banimento").setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("dias")
        .setDescription("Dias de mensagens a deletar (0-7)")
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const user = interaction.options.getUser("usuario", true);
    const motivo = interaction.options.getString("motivo") ?? "Sem motivo informado";
    const dias = interaction.options.getInteger("dias") ?? 0;

    if (user.id === interaction.user.id) {
      await interaction.reply(v2EphemeralReply([errorContainer("Você não pode se banir.")]));
      return;
    }

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (member) {
      if (member.roles.cache.has(IMMUNE_ROLE_ID)) {
        await interaction.reply(
          v2EphemeralReply([errorContainer("Este usuário possui um cargo imune a punições.")])
        );
        return;
      }

      if (!member.bannable) {
        await interaction.reply(
          v2EphemeralReply([errorContainer("Não tenho permissão para banir este usuário.")])
        );
        return;
      }

      const interactionMember = await guild.members.fetch(interaction.user.id).catch(() => null);
      if (
        interactionMember &&
        member.roles.highest.comparePositionTo(interactionMember.roles.highest) >= 0
      ) {
        await interaction.reply(
          v2EphemeralReply([
            errorContainer("Você não pode banir um usuário com cargo igual ou superior ao seu."),
          ])
        );
        return;
      }

      await member
        .send(
          v2Reply([
            modContainer({
              action: `${EMOJIS.mod} Você foi banido`,
              targetTag: user.tag,
              targetId: user.id,
              moderatorTag: interaction.user.tag,
              reason: motivo,
              avatarUrl: user.displayAvatarURL({ size: 256 }),
              accentColor: COLORS.ban,
            }),
          ])
        )
        .catch(() => null);
    }

    await guild.bans.create(user.id, {
      reason: `[${interaction.user.tag}] ${motivo}`,
      deleteMessageSeconds: dias * 86400,
    });

    await interaction.reply(
      v2Reply([
        modContainer({
          action: `${EMOJIS.mod} Usuário Banido`,
          targetTag: user.tag,
          targetId: user.id,
          moderatorTag: interaction.user.tag,
          reason: motivo,
          avatarUrl: user.displayAvatarURL({ size: 256 }),
          accentColor: COLORS.ban,
          extra: dias > 0 ? `**Mensagens deletadas:** ${dias} dia(s)` : undefined,
        }),
      ])
    );
  },
};
