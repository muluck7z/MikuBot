import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { type BotCommand } from "../index";
import { infoContainer, successContainer, v2Reply, v2EphemeralReply, COLORS } from "../v2/index";

export const unlockCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Desbloqueia o canal para @everyone")
    .addChannelOption((opt) =>
      opt
        .setName("canal")
        .setDescription("Canal a desbloquear (padrão: atual)")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const canal = (interaction.options.getChannel("canal") ?? interaction.channel) as TextChannel;
    const everyoneRole = guild.roles.everyone;

    await canal.permissionOverwrites.edit(everyoneRole, {
      SendMessages: null,
      AddReactions: null,
      CreatePublicThreads: null,
      CreatePrivateThreads: null,
    });

    await canal.send(
      v2Reply([
        infoContainer({
          title: "🔓 Canal Desbloqueado",
          description: `Este canal foi desbloqueado por ${interaction.user}.`,
          accentColor: COLORS.unlock,
        }),
      ])
    );

    await interaction.reply(
      v2EphemeralReply([
        successContainer("Canal Desbloqueado", `${canal} foi desbloqueado com sucesso.`),
      ])
    );
  },
};
