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

const EMOJI_REGEX = /<(a?):([a-zA-Z0-9_]{2,32}):(\d{17,20})>/g;

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

function parseEmojiInput(input: string): Array<{ animated: boolean; originalName: string; emojiId: string }> {
  return Array.from(input.matchAll(EMOJI_REGEX), (match) => ({
    animated: match[1] === "a",
    originalName: match[2]!,
    emojiId: match[3]!,
  }));
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

      const inputs = parseEmojiInput(emojiInput);
      if (inputs.length === 0 || inputs.length > 10) {
        await interaction.reply(
          v2EphemeralReply([
            errorContainer(
              [
                inputs.length > 10
                  ? "Você pode adicionar no máximo 10 emojis por comando."
                  : "Nenhum emoji customizado válido foi encontrado.",
                "",
                "**Como usar:**",
                "1. Clique no campo `emoji` do comando",
                "2. Abra o teclado de emojis do Discord e escolha um ou mais emojis",
                "3. Separe vários emojis por espaço (ex.: `:emoji1: :emoji2:`)",
                "",
                "⚠️ Emojis padrão como 😂 🎉 não podem ser copiados, apenas emojis customizados de servidores.",
              ].join("\n")
            ),
          ])
        );
        return;
      }

      if (inputs.length > 1 && nomeCustom) {
        await interaction.reply(
          v2EphemeralReply([
            errorContainer("O campo `nome` só pode ser usado quando um único emoji é adicionado."),
          ])
        );
        return;
      }

      const emojis = await guild.emojis.fetch();
      const limit = emojiLimit(guild.premiumTier);
      const staticCount = emojis.filter((emoji) => !emoji.animated).size;
      const animatedCount = emojis.filter((emoji) => emoji.animated).size;
      const requestedStatic = inputs.filter((input) => !input.animated).length;
      const requestedAnimated = inputs.filter((input) => input.animated).length;
      if (staticCount + requestedStatic > limit || animatedCount + requestedAnimated > limit) {
        await interaction.reply(
          v2EphemeralReply([
            errorContainer(
              `Não há espaço para todos os emojis solicitados.\n` +
              `Estáticos: ${staticCount + requestedStatic}/${limit}\n` +
              `Animados: ${animatedCount + requestedAnimated}/${limit}\n\n` +
              "Aumente o nível de boost para ampliar o limite."
            ),
          ])
        );
        return;
      }

      const prepared = inputs.map((input, index) => {
        const originalName = input.originalName;
        const nomeRaw = nomeCustom ?? (inputs.length > 1 ? originalName : originalName);
        return { ...input, originalName, nome: sanitizeEmojiName(nomeRaw), index };
      });
      const invalid = prepared.find((item) => item.nome.length < 2);
      if (invalid) {
        await interaction.reply(
          v2EphemeralReply([
            errorContainer(`O nome \`${invalid.originalName}\` não é válido após sanitização. Use ao menos 2 caracteres.`),
          ])
        );
        return;
      }

      const duplicate = prepared.find((item) => emojis.some((emoji) => emoji.name === item.nome));
      if (duplicate) {
        await interaction.reply(
          v2EphemeralReply([errorContainer(`Já existe um emoji chamado \`${duplicate.nome}\`. Use outro nome.`)])
        );
        return;
      }

      const duplicateNames = prepared.filter((item, index) => prepared.some((other, otherIndex) => otherIndex < index && other.nome === item.nome));
      if (duplicateNames.length > 0) {
        await interaction.reply(v2EphemeralReply([errorContainer("Os emojis do comando precisam ter nomes diferentes.")]));
        return;
      }

      await interaction.deferReply();

      const created = [];
      for (const item of prepared) {
        const ext = item.animated ? "gif" : "png";
        const cdnUrl = `https://cdn.discordapp.com/emojis/${item.emojiId}.${ext}?size=128&quality=lossless`;
        const newEmoji = await guild.emojis.create({
          attachment: cdnUrl,
          name: item.nome,
          reason: `[${interaction.user.tag}] Copiado via /emoji add (ID origem: ${item.emojiId})`,
        });
        created.push(newEmoji);
      }

      await interaction.editReply(
        v2Reply([
          infoContainer({
            title: `✅ ${created.length} emoji${created.length === 1 ? "" : "s"} copiado${created.length === 1 ? "" : "s"}`,
            description: [
              created.map((emoji) => `${emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`} \`:${emoji.name}:\``).join("\n"),
              `**Copiado por:** ${interaction.user}`,
              `**Emojis no servidor:** ${guild.emojis.cache.size}/${limit} estáticos + ${guild.emojis.cache.filter((emoji) => emoji.animated).size}/${limit} animados`,
            ].join("\n"),
            avatarUrl: created[0]?.url,
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
          }),
        ])
      );
    }
  },
};
