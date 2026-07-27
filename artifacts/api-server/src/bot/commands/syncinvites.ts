import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { type BotCommand } from "../index";
import { infoContainer, v2Reply, COLORS } from "../v2/index";
import { reconcileGuildInvites } from "../inviteTracker";

export const syncInvitesCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("sync-invites")
    .setDescription(
      "Recalcula os invites pendentes de todos com base no total real de usos de cada link"
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    await interaction.deferReply({ ephemeral: true });

    const credits = await reconcileGuildInvites(guild);

    if (credits.length === 0) {
      await interaction.editReply({
        ...v2Reply(
          [
            infoContainer({
              title: "🔄 Sincronização de Invites",
              description: "Nenhum invite pendente novo para creditar — tudo já está em dia.",
              accentColor: COLORS.info,
            }),
          ],
          { ephemeral: true }
        ),
      });
      return;
    }

    // Soma os créditos por criador (um usuário pode ter mais de um link)
    const totals = new Map<string, number>();
    for (const c of credits) {
      totals.set(c.inviterId, (totals.get(c.inviterId) ?? 0) + c.credited);
    }

    const lines = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([userId, amount]) => `<@${userId}> — **+${amount}** invite(s)`);

    await interaction.editReply({
      ...v2Reply(
        [
          infoContainer({
            title: "🔄 Sincronização de Invites",
            description: `Invites pendentes recalculados com base no uso real dos links:\n\n${lines.join("\n")}`,
            accentColor: COLORS.success,
          }),
        ],
        { ephemeral: true }
      ),
    });
  },
};
