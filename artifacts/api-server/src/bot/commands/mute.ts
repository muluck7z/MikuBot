import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import { modContainer, errorContainer, v2Reply, v2EphemeralReply, COLORS, EMOJIS } from "../v2/index";
import { IMMUNE_ROLE_ID } from "../config";

function parseDuration(str: string): number | null {
  const match = str.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const val = parseInt(match[1]!);
  const unit = match[2]!.toLowerCase();
  const multipliers: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return val * (multipliers[unit] ?? 0);
}

export const muteCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Silencia um usuário (timeout)")
    .addUserOption((opt) =>
      opt.setName("usuario").setDescription("Usuário a silenciar").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("duracao")
        .setDescription("Duração (ex: 10m, 1h, 1d). Máx: 28d")
        .setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("motivo").setDescription("Motivo do mute").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const user = interaction.options.getUser("usuario", true);
    const duracaoStr = interaction.options.getString("duracao", true);
    const motivo = interaction.options.getString("motivo") ?? "Sem motivo informado";

    const ms = parseDuration(duracaoStr);
    if (!ms) {
      await interaction.reply(
        v2EphemeralReply([
          errorContainer("Duração inválida. Use: `10s`, `5m`, `1h`, `1d` (máx: 28d)"),
        ])
      );
      return;
    }

    const maxMs = 28 * 24 * 60 * 60 * 1000;
    if (ms > maxMs) {
      await interaction.reply(
        v2EphemeralReply([errorContainer("Duração máxima de timeout é 28 dias.")])
      );
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

    if (!member.moderatable) {
      await interaction.reply(v2EphemeralReply([errorContainer("Não posso silenciar este usuário.")]));
      return;
    }

    await member.timeout(ms, `[${interaction.user.tag}] ${motivo}`);

    const until = new Date(Date.now() + ms);
    const untilTs = Math.floor(until.getTime() / 1000);

    await interaction.reply(
      v2Reply([
        modContainer({
          action: `${EMOJIS.mod} Usuário Silenciado`,
          targetTag: user.tag,
          targetId: user.id,
          moderatorTag: interaction.user.tag,
          reason: motivo,
          avatarUrl: user.displayAvatarURL({ size: 256 }),
          extra: `**Duração:** ${duracaoStr}\n**Até:** <t:${untilTs}:F>`,
        }),
      ])
    );
  },
};
