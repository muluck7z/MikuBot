import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type TextChannel,
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
import {
  reactionRoleStore,
  makeKey,
  parseEmojiInput,
} from "../reactionRoleStore";

export const reactionRoleCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("reactionrole")
    .setDescription("Configura cargos automáticos por reação em mensagens")
    .addSubcommand((sub) =>
      sub
        .setName("configurar")
        .setDescription("Vincula um emoji a um cargo em uma mensagem")
        .addStringOption((opt) =>
          opt
            .setName("mensagem_id")
            .setDescription("ID da mensagem que receberá as reações")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("emoji")
            .setDescription("Emoji que dará o cargo (unicode 🎉 ou customizado <:nome:id>)")
            .setRequired(true)
        )
        .addRoleOption((opt) =>
          opt
            .setName("cargo")
            .setDescription("Cargo que será adicionado ao reagir")
            .setRequired(true)
        )
        .addChannelOption((opt) =>
          opt
            .setName("canal")
            .setDescription("Canal onde está a mensagem (padrão: canal atual)")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remover")
        .setDescription("Remove uma configuração de cargo por reação")
        .addStringOption((opt) =>
          opt
            .setName("mensagem_id")
            .setDescription("ID da mensagem")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("emoji")
            .setDescription("Emoji a remover")
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("listar")
        .setDescription("Lista todas as configurações de cargos por reação do servidor")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const sub = interaction.options.getSubcommand();

    // ── Configurar ─────────────────────────────────────────────────────────────
    if (sub === "configurar") {
      const messageId = interaction.options.getString("mensagem_id", true).trim();
      const emojiInput = interaction.options.getString("emoji", true);
      const role = interaction.options.getRole("cargo", true);
      const channelOpt = interaction.options.getChannel("canal");

      const parsed = parseEmojiInput(emojiInput);
      if (!parsed) {
        await interaction.reply(
          v2EphemeralReply([errorContainer("Emoji inválido. Use um emoji unicode (🎉) ou customizado (<:nome:id>).")])
        );
        return;
      }

      // Resolve o canal
      const channel = (channelOpt ?? interaction.channel) as TextChannel | null;
      if (!channel || !("messages" in channel)) {
        await interaction.reply(
          v2EphemeralReply([errorContainer("Canal inválido ou não encontrado.")])
        );
        return;
      }

      // Verifica se a mensagem existe
      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (!message) {
        await interaction.reply(
          v2EphemeralReply([
            errorContainer(`Mensagem \`${messageId}\` não encontrada em ${channel}.\nVerifique se o ID está correto e se estou no canal certo.`),
          ])
        );
        return;
      }

      // Verifica se a configuração já existe
      const key = makeKey(messageId, parsed.key);
      if (reactionRoleStore.has(key)) {
        await interaction.reply(
          v2EphemeralReply([
            errorContainer(`Esse emoji já está configurado nessa mensagem. Use \`/reactionrole remover\` primeiro.`),
          ])
        );
        return;
      }

      // Verifica posição do cargo
      const guildRole = guild.roles.cache.get(role.id);
      const botMember = await guild.members.fetchMe();
      if (guildRole && guildRole.position >= botMember.roles.highest.position) {
        await interaction.reply(
          v2EphemeralReply([errorContainer("Não posso gerenciar um cargo superior ao meu.")])
        );
        return;
      }

      // Salva no store
      reactionRoleStore.set(key, {
        guildId: guild.id,
        channelId: channel.id,
        messageId,
        emojiKey: parsed.key,
        emojiDisplay: parsed.display,
        roleId: role.id,
      });

      // Bot reage na mensagem para indicar visualmente
      await message.react(parsed.display).catch(() => null);

      await interaction.reply(
        v2Reply([
          successContainer(
            "Cargo por Reação Configurado",
            [
              `**Mensagem:** [Clique aqui](${message.url})`,
              `**Emoji:** ${parsed.display}`,
              `**Cargo:** <@&${role.id}>`,
              `**Canal:** ${channel}`,
              "",
              "Qualquer membro que reagir com esse emoji receberá o cargo automaticamente.",
            ].join("\n")
          ),
        ])
      );
      return;
    }

    // ── Remover ────────────────────────────────────────────────────────────────
    if (sub === "remover") {
      const messageId = interaction.options.getString("mensagem_id", true).trim();
      const emojiInput = interaction.options.getString("emoji", true);

      const parsed = parseEmojiInput(emojiInput);
      if (!parsed) {
        await interaction.reply(
          v2EphemeralReply([errorContainer("Emoji inválido.")])
        );
        return;
      }

      const key = makeKey(messageId, parsed.key);
      const entry = reactionRoleStore.get(key);

      if (!entry || entry.guildId !== guild.id) {
        await interaction.reply(
          v2EphemeralReply([errorContainer("Configuração não encontrada para essa mensagem e emoji.")])
        );
        return;
      }

      reactionRoleStore.delete(key);

      // Remove a reação do bot na mensagem, se possível
      try {
        const channel = await guild.channels.fetch(entry.channelId) as TextChannel | null;
        if (channel && "messages" in channel) {
          const message = await channel.messages.fetch(messageId).catch(() => null);
          if (message) {
            const botReaction = message.reactions.cache.find(
              (r) => (r.emoji.id ?? r.emoji.name) === entry.emojiKey
            );
            await botReaction?.users.remove(guild.members.me?.id).catch(() => null);
          }
        }
      } catch {
        // Ignora erros ao remover reação — o registro já foi deletado
      }

      await interaction.reply(
        v2Reply([
          successContainer(
            "Configuração Removida",
            `O cargo por reação com ${entry.emojiDisplay} na mensagem \`${messageId}\` foi removido.`
          ),
        ])
      );
      return;
    }

    // ── Listar ─────────────────────────────────────────────────────────────────
    if (sub === "listar") {
      const entries = [...reactionRoleStore.values()].filter(
        (e) => e.guildId === guild.id
      );

      if (entries.length === 0) {
        await interaction.reply(
          v2EphemeralReply([
            infoContainer({
              title: "📋 Cargos por Reação",
              description: "Nenhuma configuração ativa neste servidor.\nUse `/reactionrole configurar` para criar uma.",
              accentColor: COLORS.info,
            }),
          ])
        );
        return;
      }

      const lines = entries.map((e, i) => {
        return `**${i + 1}.** ${e.emojiDisplay} → <@&${e.roleId}>\n　Mensagem: \`${e.messageId}\` | <#${e.channelId}>`;
      });

      await interaction.reply(
        v2Reply([
          infoContainer({
            title: `📋 Cargos por Reação (${entries.length})`,
            description: lines.join("\n\n"),
            accentColor: COLORS.info,
          }),
        ])
      );
    }
  },
};
