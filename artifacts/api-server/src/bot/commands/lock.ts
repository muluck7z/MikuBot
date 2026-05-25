import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
  type TextChannel,
} from "discord.js";
import { type BotCommand } from "../index";
import {
  infoContainer,
  successContainer,
  v2Reply,
  v2EphemeralReply,
  COLORS,
} from "../v2/index";

export const lockCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Bloqueia o canal para @everyone")
    .addStringOption((opt) =>
      opt.setName("motivo").setDescription("Motivo do bloqueio").setRequired(false)
    )
    .addChannelOption((opt) =>
      opt
        .setName("canal")
        .setDescription("Canal a bloquear (padrão: atual)")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildText)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const canal = (interaction.options.getChannel("canal") ?? interaction.channel) as TextChannel;
    const motivo = interaction.options.getString("motivo") ?? "Sem motivo informado";
    const everyoneRole = guild.roles.everyone;

    await canal.permissionOverwrites.edit(everyoneRole, {
      SendMessages: false,
      AddReactions: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
    });

    await canal.send(
      v2Reply([
        infoContainer({
          title: "🔒 Canal Bloqueado",
          description: `Este canal foi bloqueado por ${interaction.user}.\n**Motivo:** ${motivo}\n\nUse \`/unlock\` para desbloquear.`,
          accentColor: COLORS.lock,
        }),
      ])
    );

    await interaction.reply(
      v2EphemeralReply([
        successContainer("Canal Bloqueado", `${canal} foi bloqueado com sucesso.`),
      ])
    );
  },
};
