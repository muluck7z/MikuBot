import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import {
  modContainer,
  infoContainer,
  errorContainer,
  v2Reply,
  v2EphemeralReply,
  COLORS,
  EMOJIS,
} from "../v2/index";

const warnings = new Map<string, { motivo: string; moderador: string; data: Date }[]>();

export const warnCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Gerencia advertências de usuários")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Adiciona uma advertência")
        .addUserOption((opt) =>
          opt.setName("usuario").setDescription("Usuário").setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("motivo").setDescription("Motivo").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("Lista as advertências de um usuário")
        .addUserOption((opt) =>
          opt.setName("usuario").setDescription("Usuário").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("clear")
        .setDescription("Limpa todas as advertências de um usuário")
        .addUserOption((opt) =>
          opt.setName("usuario").setDescription("Usuário").setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser("usuario", true);
    const key = `${guild.id}:${user.id}`;

    if (sub === "add") {
      const motivo = interaction.options.getString("motivo", true);
      const list = warnings.get(key) ?? [];
      list.push({ motivo, moderador: interaction.user.tag, data: new Date() });
      warnings.set(key, list);

      await user
        .send(
          v2Reply([
            modContainer({
              action: `${EMOJIS.mod} Você recebeu uma advertência`,
              targetTag: user.tag,
              targetId: user.id,
              moderatorTag: interaction.user.tag,
              reason: motivo,
              avatarUrl: user.displayAvatarURL({ size: 256 }),
              accentColor: COLORS.warning,
              extra: `**Total de advertências:** ${list.length}`,
            }),
          ])
        )
        .catch(() => null);

      await interaction.reply(
        v2Reply([
          modContainer({
            action: `${EMOJIS.mod} Advertência Aplicada`,
            targetTag: user.tag,
            targetId: user.id,
            moderatorTag: interaction.user.tag,
            reason: motivo,
            avatarUrl: user.displayAvatarURL({ size: 256 }),
            accentColor: COLORS.warning,
            extra: `**Total de advertências:** ${list.length}`,
          }),
        ])
      );
    } else if (sub === "list") {
      const list = warnings.get(key) ?? [];

      if (list.length === 0) {
        await interaction.reply(
          v2EphemeralReply([
            infoContainer({
              title: `📋 Advertências de ${user.tag}`,
              description: "Nenhuma advertência registrada.",
              avatarUrl: user.displayAvatarURL({ size: 256 }),
              accentColor: COLORS.primary,
            }),
          ])
        );
        return;
      }

      const warnLines = list
        .slice(-10)
        .map(
          (w, i) =>
            `**Warn #${i + 1}**\nMotivo: ${w.motivo} · Moderador: ${w.moderador} · <t:${Math.floor(w.data.getTime() / 1000)}:R>`
        )
        .join("\n\n");

      await interaction.reply(
        v2EphemeralReply([
          infoContainer({
            title: `📋 Advertências de ${user.tag}`,
            description: `Total: **${list.length}** advertência(s)\n\n${warnLines}`,
            avatarUrl: user.displayAvatarURL({ size: 256 }),
            accentColor: COLORS.warning,
          }),
        ])
      );
    } else if (sub === "clear") {
      warnings.delete(key);
      await interaction.reply(
        v2Reply([
          modContainer({
            action: `${EMOJIS.mod} Advertências Limpas`,
            targetTag: user.tag,
            targetId: user.id,
            moderatorTag: interaction.user.tag,
            reason: "Todas as advertências foram removidas.",
            avatarUrl: user.displayAvatarURL({ size: 256 }),
            accentColor: COLORS.success,
          }),
        ])
      );
    }
  },
};
