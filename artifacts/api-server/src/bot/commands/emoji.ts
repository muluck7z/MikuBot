import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import {
  infoContainer,
  successContainer,
  errorContainer,
  v2Reply,
  v2EphemeralReply,
  COLORS,
} from "../v2/index";

const EMOJI_REGEX = /^<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>$/;

function sanitizeEmojiName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 32);
}

function emojiLimit(premiumTier: number): number {
  return [50, 100, 150, 250][premiumTier] ?? 50;
}

export const emojiCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("emoji")
    .setDescription("Gerencia emojis do servidor")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Copia um emoji de qualquer servidor para o seu")
        .addStringOption((opt) =>
          opt
            .setName("emoji")
            .setDescription("Selecione o emoji pelo teclado do Discord (deve ser emoji customizado)")
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("nome")
            .setDescription("Nome personalizado (opcional — padrão: mesmo nome do emoji)")
            .setRequired(false)
            .setMinLength(2)
            .setMaxLength(32)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove um emoji do servidor pelo nome")
        .addStringOption((opt) =>
          opt.setName("nome").setDescription("Nome exato do emoji").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("Lista todos os emojis customizados do servidor")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    if (!guild) return;

    const sub = interaction.options.getSubcommand();

    if (sub === "add") {
      const emojiInput = interaction.options.getString("emoji", true).trim();
      const nomeCustom = interaction.options.getString("nome");

      const match = EMOJI_REGEX.exec(emojiInput);

      if (!match) {
        await interaction.reply(
          v2EphemeralReply([
            errorContainer(
              [
                "Isso não é um emoji customizado.",
                "",
                "**Como usar:**",
                "1. Clique no campo `emoji` do comando",
                "2. Abra o teclado de emojis do Discord (ícone de smile ou tecla `:`)",
                "3. Vá em **Seus Servidores** e escolha o emoji que quer copiar",
                "4. Clique nele — ele será inserido automaticamente",
                "",
                "⚠️ Emojis padrão como 😂 🎉 não podem ser copiados, apenas emojis customizados de servidores.",
              ].join("\n")
            ),
          ])
        );
        return;
      }

      const isAnimated = match[1] === "a";
      const originalName = match[2]!;
      const emojiId = match[3]!;

      const nomeRaw = nomeCustom ?? originalName;
      const nome = sanitizeEmojiName(nomeRaw);

      if (nome.length < 2) {
        await interaction.reply(
          v2EphemeralReply([
            errorContainer(
              `O nome \`${nomeRaw}\` resultou em \`${nome || "(vazio)"}\` após sanitização.\nUse apenas letras, números e underscores (mín: 2 caracteres).`
            ),
          ])
        );
        return;
      }

      const limit = emojiLimit(guild.premiumTier);
      if (guild.emojis.cache.size >= limit) {
        await interaction.reply(
          v2EphemeralReply([
            errorContainer(
              `O servidor atingiu o limite de emojis (${guild.emojis.cache.size}/${limit}).\nAumente o nível de boost para adicionar mais.`
            ),
          ])
        );
        return;
      }

      const existing = guild.emojis.cache.find((e) => e.name === nome);
      if (existing) {
        const preview = existing.animated
          ? `<a:${existing.name}:${existing.id}>`
          : `<:${existing.name}:${existing.id}>`;
        await interaction.reply(
          v2EphemeralReply([
            errorContainer(
              `Já existe um emoji chamado \`${nome}\` neste servidor: ${preview}\n\nUse o parâmetro \`nome\` para escolher um nome diferente.`
            ),
          ])
        );
        return;
      }

      const ext = isAnimated ? "gif" : "png";
      const cdnUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=128&quality=lossless`;

      await interaction.deferReply();

      const newEmoji = await guild.emojis
        .create({
          attachment: cdnUrl,
          name: nome,
          reason: `[${interaction.user.tag}] Copiado via /emoji add (ID origem: ${emojiId})`,
        })
        .catch((err: Error) => {
          throw new Error(`Falha ao criar emoji: ${err.message}`);
        });

      const preview = newEmoji.animated
        ? `<a:${newEmoji.name}:${newEmoji.id}>`
        : `<:${newEmoji.name}:${newEmoji.id}>`;

      const renamed = nome !== originalName;

      await interaction.editReply(
        v2Reply([
          infoContainer({
            title: "✅ Emoji Copiado",
            description: [
              `**Preview:** ${preview}`,
              `**Nome:** \`:${newEmoji.name}:\`${renamed ? ` (original: \`:${originalName}:\`)` : ""}`,
              `**ID:** \`${newEmoji.id}\``,
              `**Animado:** ${newEmoji.animated ? "Sim" : "Não"}`,
              `**Copiado por:** ${interaction.user}`,
              `**Emojis no servidor:** ${guild.emojis.cache.size}/${limit}`,
            ].join("\n"),
            avatarUrl: newEmoji.url,
            accentColor: COLORS.success,
          }),
        ])
      );
    } else if (sub === "remove") {
      const nome = interaction.options.getString("nome", true);

      const emoji = guild.emojis.cache.find((e) => e.name === nome);
      if (!emoji) {
        await interaction.reply(
          v2EphemeralReply([
            errorContainer(
              `Nenhum emoji chamado \`${nome}\` encontrado neste servidor.\nUse \`/emoji list\` para ver os emojis disponíveis.`
            ),
          ])
        );
        return;
      }

      const emojiUrl = emoji.url;
      const emojiId = emoji.id;

      await emoji.delete(`[${interaction.user.tag}] Removido via /emoji remove`);

      await interaction.reply(
        v2Reply([
          infoContainer({
            title: "🗑️ Emoji Removido",
            description: [
              `**Nome:** \`:${nome}:\``,
              `**ID:** \`${emojiId}\``,
              `**Removido por:** ${interaction.user}`,
            ].join("\n"),
            avatarUrl: emojiUrl,
            accentColor: COLORS.danger,
          }),
        ])
      );
    } else if (sub === "list") {
      const emojis = guild.emojis.cache;

      if (emojis.size === 0) {
        await interaction.reply(
          v2EphemeralReply([
            successContainer(
              "Emojis do Servidor",
              "Este servidor não possui emojis customizados ainda.\n\nUse `/emoji add` para copiar emojis de outros servidores!"
            ),
          ])
        );
        return;
      }

      const staticEmojis = emojis.filter((e) => !e.animated);
      const animatedEmojis = emojis.filter((e) => !!e.animated);
      const limit = emojiLimit(guild.premiumTier);

      const formatList = (col: typeof emojis): string =>
        col
          .map((e) => (e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`))
          .join(" ")
          .slice(0, 900) || "Nenhum";

      const lines = [
        `**Total:** ${emojis.size}/${limit}`,
        ``,
        `**Estáticos (${staticEmojis.size}):**`,
        formatList(staticEmojis),
        ``,
        `**Animados (${animatedEmojis.size}):**`,
        formatList(animatedEmojis),
      ].join("\n");

      await interaction.reply(
        v2EphemeralReply([
          infoContainer({
            title: `😀 Emojis de ${guild.name}`,
            description: lines,
            avatarUrl: guild.iconURL({ size: 256 }) ?? undefined,
            accentColor: COLORS.primary,
          }),
        ])
      );
    }
  },
};
