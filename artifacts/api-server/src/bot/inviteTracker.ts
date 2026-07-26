import { type Guild } from "discord.js";
import { addPendingInvite } from "./economyStore";
import { logger } from "../lib/logger";

// guildId → Map<inviteCode, uses>
const inviteCache = new Map<string, Map<string, number>>();

/** Lê e armazena em cache os usos atuais de todos os invites de um servidor. */
export async function cacheGuildInvites(guild: Guild): Promise<void> {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map<string, number>();
    for (const [code, invite] of invites) {
      map.set(code, invite.uses ?? 0);
    }
    inviteCache.set(guild.id, map);
    logger.debug({ guild: guild.name, count: invites.size }, "Invites cacheados");
  } catch (err) {
    logger.warn({ err, guild: guild.name }, "Não foi possível cachear invites (sem permissão?)");
  }
}

/**
 * Chamado quando um novo membro entra.
 * Compara o cache antigo com os novos usos para descobrir qual invite foi usado
 * e credita 1 invite pendente para o criador do link.
 */
export async function handleMemberAdd(guild: Guild, newMemberId: string): Promise<void> {
  try {
    const oldCache = inviteCache.get(guild.id) ?? new Map<string, number>();
    const freshInvites = await guild.invites.fetch();

    let inviterId: string | null = null;

    for (const [code, invite] of freshInvites) {
      const oldUses = oldCache.get(code) ?? 0;
      const newUses = invite.uses ?? 0;

      if (newUses > oldUses && invite.inviterId) {
        inviterId = invite.inviterId;
        logger.info(
          { inviter: invite.inviterId, invited: newMemberId, code },
          "Invite rastreado"
        );
        break;
      }
    }

    // Atualiza cache com valores frescos
    const updatedMap = new Map<string, number>();
    for (const [code, invite] of freshInvites) {
      updatedMap.set(code, invite.uses ?? 0);
    }
    inviteCache.set(guild.id, updatedMap);

    // Credita o criador do invite
    if (inviterId) {
      addPendingInvite(inviterId);
    }
  } catch (err) {
    logger.warn({ err, guild: guild.name }, "Falha ao rastrear invite no guildMemberAdd");
  }
}
