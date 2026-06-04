import {
  type Message,
  type TextChannel,
  type Guild,
  type Role,
  EmbedBuilder,
} from "discord.js";
import { logger } from "../../lib/logger";
import { cargoSessions, type CargoSession, type CargoEntry } from "../cargoSessionStore";
import { reactionRoleStore, makeKey, parseEmojiInput } from "../reactionRoleStore";
import { hasStaffAccess } from "../guard";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function reply(message: Message, text: string) {
  return message.channel.send(text).catch(() => null);
}

/**
 * Extrai emoji + role de uma linha no formato "{emoji} {menção de cargo}"
 * Suporta menção (<@&id>) ou busca por nome.
 */
function parseCargoLine(
  content: string,
  guild: Guild
): { emoji: string; emojiKey: string; role: Role } | null {
  const trimmed = content.trim();

  // Extrai menção de cargo, se houver
  const mentionMatch = trimmed.match(/<@&(\d+)>/);
  let role: Role | undefined;
  let emojiPart: string;

  if (mentionMatch) {
    role = guild.roles.cache.get(mentionMatch[1]!);
    emojiPart = trimmed.replace(mentionMatch[0], "").trim();
  } else {
    // Sem menção: primeiro "token" é emoji, o resto é nome do cargo
    const parts = trimmed.split(/\s+/);
    emojiPart = parts[0] ?? "";
    const roleName = parts.slice(1).join(" ").toLowerCase();
    role = guild.roles.cache.find((r) => r.name.toLowerCase() === roleName);
  }

  if (!role || !emojiPart) return null;

  const parsed = parseEmojiInput(emojiPart);
  if (!parsed) return null;

  return { emoji: parsed.display, emojiKey: parsed.key, role };
}

/** Extrai channelId de uma URL ou menção de canal */
function parseChannelInput(input: string): string | null {
  const trimmed = input.trim();

  // Menção: <#channelId>
  const mentionMatch = trimmed.match(/^<#(\d+)>$/);
  if (mentionMatch) return mentionMatch[1]!;

  // URL Discord: https://discord.com/channels/{guildId}/{channelId}
  const urlMatch = trimmed.match(/discord\.com\/channels\/\d+\/(\d+)/);
  if (urlMatch) return urlMatch[1]!;

  // ID puro
  if (/^\d+$/.test(trimmed)) return trimmed;

  return null;
}

// ─── Fluxo principal ──────────────────────────────────────────────────────────

/** Chamado quando o staff digita !cargo */
export async function handleCargoCommand(message: Message): Promise<void> {
  if (!message.guild || !message.member) return;

  if (!hasStaffAccess(message.member)) {
    await reply(message, "❌ Apenas **moderadores**, **gerentes** e **administradores** podem usar este comando.");
    return;
  }

  // Reinicia sessão caso já exista uma
  cargoSessions.set(message.author.id, {
    step: "titulo",
    guildId: message.guild.id,
    setupChannelId: message.channel.id,
    titulo: "",
    descricao: "",
    cargos: [],
  });

  await reply(message, "📝 **Configuração de cargo por reação iniciada!**\n\nQual o **título** da mensagem?");
}

/** Chamado para cada mensagem de um usuário que tem sessão ativa */
export async function handleCargoSession(
  message: Message,
  session: CargoSession
): Promise<void> {
  const content = message.content.trim();
  const guild = message.guild;
  if (!guild) return;

  // Garante que a mensagem está no canal de setup
  if (message.channel.id !== session.setupChannelId) return;

  switch (session.step) {

    // ── Título ────────────────────────────────────────────────────────────────
    case "titulo": {
      if (!content) {
        await reply(message, "❌ O título não pode ser vazio. Tente novamente:");
        return;
      }
      session.titulo = content;
      session.step = "descricao";
      await reply(message, `✅ Título: **${content}**\n\nAgora envie a **descrição** da mensagem:`);
      break;
    }

    // ── Descrição ─────────────────────────────────────────────────────────────
    case "descricao": {
      if (!content) {
        await reply(message, "❌ A descrição não pode ser vazia. Tente novamente:");
        return;
      }
      session.descricao = content;
      session.step = "cargos";
      await reply(
        message,
        [
          "✅ Descrição salva!",
          "",
          "**Agora configure os cargos.**",
          "Envie cada cargo em uma mensagem separada no formato:",
          "> `{emoji} {@cargo}`",
          "",
          "Exemplo: `🎉 @Membro` ou `<:vip:123> @VIP`",
          "",
          "Quando terminar, envie `!pronto`.",
        ].join("\n")
      );
      break;
    }

    // ── Cargos (loop) ─────────────────────────────────────────────────────────
    case "cargos": {
      if (content.toLowerCase() === "!pronto") {
        if (session.cargos.length === 0) {
          await reply(message, "❌ Adicione pelo menos um cargo antes de continuar.");
          return;
        }
        session.step = "canal";
        await reply(
          message,
          [
            `✅ **${session.cargos.length} cargo(s) configurado(s):**`,
            session.cargos.map((c) => `${c.emoji} → <@&${c.roleId}>`).join("\n"),
            "",
            "Agora envie a **URL ou menção** do canal onde deseja postar a mensagem:",
            "> Exemplo: `#canal-boas-vindas` ou cole a URL do canal",
          ].join("\n")
        );
        return;
      }

      const parsed = parseCargoLine(content, guild);
      if (!parsed) {
        await reply(
          message,
          "❌ Formato inválido. Use: `{emoji} {@cargo}`\nExemplo: `🎉 @Membro`\n\nTente novamente ou envie `!pronto` para finalizar."
        );
        return;
      }

      // Verifica duplicata
      const alreadyAdded = session.cargos.some((c) => c.emojiKey === parsed.emojiKey);
      if (alreadyAdded) {
        await reply(message, `⚠️ O emoji ${parsed.emoji} já está na lista. Use outro emoji ou remova o anterior reiniciando com \`!cargo\`.`);
        return;
      }

      const entry: CargoEntry = {
        emoji: parsed.emoji,
        emojiKey: parsed.emojiKey,
        roleId: parsed.role.id,
        roleName: parsed.role.name,
      };
      session.cargos.push(entry);

      await reply(message, `✅ Adicionado: ${parsed.emoji} → **${parsed.role.name}**\n\nContinue adicionando ou envie \`!pronto\` para finalizar.`);
      break;
    }

    // ── Canal destino ─────────────────────────────────────────────────────────
    case "canal": {
      const channelId = parseChannelInput(content);
      if (!channelId) {
        await reply(message, "❌ Canal inválido. Mencione o canal (`#canal`) ou cole a URL do Discord. Tente novamente:");
        return;
      }

      const targetChannel = await guild.channels.fetch(channelId).catch(() => null) as TextChannel | null;
      if (!targetChannel || !("send" in targetChannel)) {
        await reply(message, "❌ Canal não encontrado ou sem permissão de envio. Tente novamente:");
        return;
      }

      // ── Monta embed ───────────────────────────────────────────────────────
      const listaRoles = session.cargos
        .map((c) => `${c.emoji} → <@&${c.roleId}>`)
        .join("\n");

      const separador = "─────────────────────────────────";

      const embed = new EmbedBuilder()
        .setTitle(session.titulo)
        .setDescription(`${separador}\n${session.descricao}\n\n${listaRoles}`);

      let postedMessage;
      try {
        postedMessage = await targetChannel.send({ embeds: [embed] });
      } catch {
        await reply(message, "❌ Não consegui enviar a mensagem nesse canal. Verifique minhas permissões e tente novamente:");
        return;
      }

      // ── Registra reações e reage na mensagem ──────────────────────────────
      for (const cargo of session.cargos) {
        const key = makeKey(postedMessage.id, cargo.emojiKey);
        reactionRoleStore.set(key, {
          guildId: guild.id,
          channelId: targetChannel.id,
          messageId: postedMessage.id,
          emojiKey: cargo.emojiKey,
          emojiDisplay: cargo.emoji,
          roleId: cargo.roleId,
        });

        await postedMessage.react(cargo.emoji).catch(() => null);
      }

      // ── Encerra sessão ────────────────────────────────────────────────────
      cargoSessions.delete(message.author.id);

      logger.info(
        { messageId: postedMessage.id, channelId: targetChannel.id, roles: session.cargos.length },
        "Mensagem de cargo por reação enviada"
      );

      await reply(
        message,
        [
          `✅ **Mensagem enviada em ${targetChannel}!**`,
          `**${session.cargos.length} cargo(s)** configurados com sucesso.`,
          `[Ir para a mensagem](${postedMessage.url})`,
        ].join("\n")
      );
      break;
    }
  }
}
