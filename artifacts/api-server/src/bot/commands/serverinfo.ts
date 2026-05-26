import {
  SlashCommandBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import { infoContainer, v2Reply, COLORS } from "../v2/index";

const verificationLevels = ["Nenhum", "Baixo", "Médio", "Alto", "Muito Alto"];

export const serverInfoCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Mostra informações detalhadas do servidor"),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    await guild.fetch();

    const textChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
    const voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;
    const categoryChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size;
    const botCount = guild.members.cache.filter((m) => m.user.bot).size;
    const humanCount = guild.memberCount - botCount;

    const lines = [
      `**ID:** \`${guild.id}\``,
      `**Dono:** <@${guild.ownerId}>`,
      `**Criado em:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
      `**Membros:** ${guild.memberCount} total · ${humanCount} humanos · ${botCount} bots`,
      `**Canais:** ${guild.channels.cache.size} total · 💬 ${textChannels} · 🔊 ${voiceChannels} · 📁 ${categoryChannels}`,
      `**Cargos:** ${guild.roles.cache.size}`,
      `**Emojis:** ${guild.emojis.cache.size}`,
      `**Boosts:** ${guild.premiumSubscriptionCount ?? 0} (Nível ${guild.premiumTier})`,
      `**Verificação:** ${verificationLevels[guild.verificationLevel] ?? "Desconhecido"}`,
    ].join("\n");

    await interaction.reply(
      v2Reply([
        infoContainer({
          title: `🏰 ${guild.name}`,
          description: (guild.description ? `${guild.description}\n\n` : "") + lines,
          avatarUrl: guild.iconURL({ size: 256 }) ?? undefined,
        }),
      ])
    );
  },
};
