import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import {
  successContainer,
  errorContainer,
  infoContainer,
  v2Reply,
  v2EphemeralReply,
  COLORS,
} from "../v2/index";

export const roleCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("role")
    .setDescription("Gerencia cargos de um usuário")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Adiciona um cargo a um usuário")
        .addUserOption((opt) =>
          opt.setName("usuario").setDescription("Usuário").setRequired(true)
        )
        .addRoleOption((opt) =>
          opt.setName("cargo").setDescription("Cargo a adicionar").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove um cargo de um usuário")
        .addUserOption((opt) =>
          opt.setName("usuario").setDescription("Usuário").setRequired(true)
        )
        .addRoleOption((opt) =>
          opt.setName("cargo").setDescription("Cargo a remover").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("Lista os cargos de um usuário")
        .addUserOption((opt) =>
          opt.setName("usuario").setDescription("Usuário").setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser("usuario", true);
    const member = await guild.members.fetch(user.id).catch(() => null);

    if (!member) {
      await interaction.reply(v2EphemeralReply([errorContainer("Usuário não encontrado no servidor.")]));
      return;
    }

    if (sub === "add" || sub === "remove") {
      const callerMember = await guild.members.fetch(interaction.user.id).catch(() => null);
      if (!callerMember?.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply(
          v2EphemeralReply([
            errorContainer("Apenas **administradores** podem adicionar ou remover cargos pelo bot."),
          ])
        );
        return;
      }
    }

    if (sub === "add") {
      const role = interaction.options.getRole("cargo", true);
      const guildRole = guild.roles.cache.get(role.id);
      if (!guildRole) {
        await interaction.reply(v2EphemeralReply([errorContainer("Cargo não encontrado.")]));
        return;
      }

      const botMember = await guild.members.fetchMe();
      if (guildRole.position >= botMember.roles.highest.position) {
        await interaction.reply(
          v2EphemeralReply([errorContainer("Não posso adicionar um cargo superior ao meu.")])
        );
        return;
      }

      await member.roles.add(guildRole, `[${interaction.user.tag}] Cargo adicionado`);
      await interaction.reply(
        v2Reply([
          successContainer(
            "Cargo Adicionado",
            `${guildRole} foi adicionado a **${user.tag}** por ${interaction.user}.`
          ),
        ])
      );
    } else if (sub === "remove") {
      const role = interaction.options.getRole("cargo", true);
      const guildRole = guild.roles.cache.get(role.id);
      if (!guildRole) {
        await interaction.reply(v2EphemeralReply([errorContainer("Cargo não encontrado.")]));
        return;
      }

      if (!member.roles.cache.has(guildRole.id)) {
        await interaction.reply(
          v2EphemeralReply([errorContainer("Este usuário não possui este cargo.")])
        );
        return;
      }

      const botMember = await guild.members.fetchMe();
      if (guildRole.position >= botMember.roles.highest.position) {
        await interaction.reply(
          v2EphemeralReply([errorContainer("Não posso remover um cargo superior ao meu.")])
        );
        return;
      }

      await member.roles.remove(guildRole, `[${interaction.user.tag}] Cargo removido`);
      await interaction.reply(
        v2Reply([
          successContainer(
            "Cargo Removido",
            `${guildRole} foi removido de **${user.tag}** por ${interaction.user}.`
          ),
        ])
      );
    } else if (sub === "list") {
      const roles = member.roles.cache
        .filter((r) => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => r.toString())
        .slice(0, 15)
        .join(", ") || "Nenhum cargo";

      const count = member.roles.cache.size - 1;

      await interaction.reply(
        v2EphemeralReply([
          infoContainer({
            title: `📋 Cargos de ${user.tag}`,
            description: `Total: **${count}** cargo(s)\n\n${roles}`,
            avatarUrl: user.displayAvatarURL({ size: 256 }),
          }),
        ])
      );
    }
  },
};
