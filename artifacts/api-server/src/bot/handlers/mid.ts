import { type Message, PermissionFlagsBits } from "discord.js";
import { midSessions, type MidSession, ticketStore } from "../ticketStore";
import { successContainer, errorContainer, v2Reply } from "../v2/index";
import { logger } from "../../lib/logger";

export async function handleMidSession(message: Message, session: MidSession): Promise<void> {
  const content = message.content.trim();
  const guild = message.guild;
  if (!guild) return;

  // Apenas o criador do ticket pode responder a sessão de parceiro
  if (message.author.id !== session.openerId) return;

  if (session.step === "partner") {
    // Tenta extrair ID de menção <@id> ou <@!id> ou ID puro
    const mentionMatch = content.match(/<@!?(\d+)>/);
    const partnerId = mentionMatch ? mentionMatch[1] : (content.match(/^\d+$/) ? content : null);

    if (!partnerId) {
      await message.reply({
        ...v2Reply([errorContainer("Formato inválido. Mencione o usuário ou envie o ID dele.")]),
      }).catch(() => null);
      return;
    }

    if (partnerId === session.openerId) {
      await message.reply({
        ...v2Reply([errorContainer("Você não pode ser o seu próprio parceiro de troca.")]),
      }).catch(() => null);
      return;
    }

    try {
      const partner = await guild.members.fetch(partnerId).catch(() => null);
      if (!partner) {
        await message.reply({
          ...v2Reply([errorContainer("Usuário não encontrado no servidor. Verifique o ID e tente novamente.")]),
        }).catch(() => null);
        return;
      }

      const channel = message.channel;
      if (!("permissionOverwrites" in channel)) return;

      await channel.permissionOverwrites.edit(partner.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
      });

      // Encerra a sessão
      midSessions.delete(session.channelId);

      // Salva o parceiro no ticketStore para uso posterior na avaliação
      const meta = ticketStore.get(channel.id);
      if (meta) {
        ticketStore.set(channel.id, { ...meta, partnerId: partner.id });
      }

      await message.reply({
        ...v2Reply([
          successContainer(
            "Parceiro Adicionado",
            `O usuário ${partner} foi adicionado ao ticket com sucesso.\n\nAgora vocês podem prosseguir com a intermediação.`
          ),
        ]),
      });

      logger.info({ opener: session.openerId, partner: partner.id, channel: channel.id }, "MID partner added");

    } catch (err) {
      logger.error({ err }, "Error adding MID partner");
      await message.reply({
        ...v2Reply([errorContainer("Ocorreu um erro ao adicionar o parceiro.")]),
      }).catch(() => null);
    }
  }
}
