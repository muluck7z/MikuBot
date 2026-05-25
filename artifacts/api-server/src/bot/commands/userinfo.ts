import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import { infoContainer, errorContainer, v2Reply, v2EphemeralReply, COLORS } from "../v2/index";

export const userInfoCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Mostra informações detalhadas sobre um usuário")
    .addUserOption((opt) =>
      opt.setName("usuario").setDescription("Usuário (padrão: você mesmo)").setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const user = interaction.options.getUser("usuario") ?? interaction.user;
    const member = await guild.members.fetch(user.id).catch(() => null);

    if (!member) {
      await interaction.reply(v2EphemeralReply([errorContainer("Usuário não encontrado no servidor.")]));
      return;
    }

    const roles = member.roles.cache
      .filter((r) => r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => r.toString())
      .slice(0, 10)
      .join(", ") || "Nenhum";

    const lines = [
      `**ID:** \`${user.id}\``,
      `**Bot:** ${user.bot ? "Sim" : "Não"}`,
      `**Conta criada:** <t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
      `**Entrou no servidor:** ${member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "Desconhecido"}`,
      `**Cor do cargo:** ${member.displayHexColor}`,
      `**Boost:** ${member.premiumSince ? `<t:${Math.floor(member.premiumSinceTimestamp! / 1000)}:R>` : "Não"}`,
      `**Cargos (${member.roles.cache.size - 1}):** ${roles}`,
    ].join("\n");

    await interaction.reply(
      v2Reply([
        infoContainer({
          title: `👤 ${user.tag}`,
          description: lines,
          avatarUrl: user.displayAvatarURL({ size: 256 }),
          accentColor: member.displayColor || COLORS.primary,
        }),
      ])
    );
  },
};
