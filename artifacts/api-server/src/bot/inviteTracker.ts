import fs from "fs";
import path from "path";
import { type Guild } from "discord.js";
import { addPendingInvite } from "./economyStore";
import { logger } from "../lib/logger";

// Salva o último número de usos conhecido de cada invite, por servidor.
// Isso é o que permite recuperar usos que aconteceram antes do bot rastrear
// aquele link (ou durante um período em que o bot ficou offline) — sem isso,
// um reinício do bot faria o "baseline" pular direto para o valor atual e os
// usos antigos nunca seriam creditados.
const DATA_FILE = path.join(process.cwd(), "invite_data.json");

type InviteData = Record<string, Record<string, number>>; // guildId -> code -> uses conhecidos

let _data: InviteData = {};

function loadData(): void {
  try {
    if (fs.existsSync(DATA_FILE)) {
      _data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as InviteData;
    }
  } catch {
    _data = {};
  }
}

function saveData(): void {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(_data, null, 2), "utf-8");
  } catch {
    // erros silenciosos de escrita
  }
}

loadData();

export interface InviteCredit {
  code: string;
  inviterId: string;
  credited: number;
}

/**
 * Busca os invites atuais do servidor e compara com o último número de usos
 * conhecido (persistido em disco) de cada um. Credita ao criador do link a
 * diferença total (`uses atuais - uses conhecidos`) — não apenas 1 — o que
 * cobre tanto:
 *   - vários usos que aconteceram enquanto o bot estava offline/reiniciando;
 *   - a primeira vez que um invite é visto (uses conhecidos = 0), creditando
 *     o total histórico de usos de uma vez.
 *
 * Retorna a lista de créditos aplicados (usado no comando de sincronização
 * manual e para log).
 */
export async function reconcileGuildInvites(guild: Guild): Promise<InviteCredit[]> {
  const credits: InviteCredit[] = [];

  let invites;
  try {
    invites = await guild.invites.fetch();
  } catch (err) {
    logger.warn({ err, guild: guild.name }, "Não foi possível buscar invites (sem permissão?)");
    return credits;
  }

  const known = _data[guild.id] ?? {};
  const updated: Record<string, number> = { ...known };

  for (const [code, invite] of invites) {
    const uses = invite.uses ?? 0;
    const lastKnown = known[code] ?? 0;
    const delta = uses - lastKnown;

    if (delta > 0 && invite.inviterId) {
      addPendingInvite(invite.inviterId, delta);
      credits.push({ code, inviterId: invite.inviterId, credited: delta });
      logger.info(
        { inviter: invite.inviterId, code, delta, totalUses: uses },
        "Invites creditados (reconciliação)"
      );
    }

    updated[code] = uses;
  }

  _data[guild.id] = updated;
  saveData();

  return credits;
}

/**
 * Chamado ao iniciar o bot (ou quando ele entra num servidor). Na prática é
 * uma reconciliação completa — garante que nenhum uso (mesmo de antes do bot
 * estar rodando, ou de enquanto ele esteve offline) fique de fora.
 */
export async function cacheGuildInvites(guild: Guild): Promise<void> {
  const credits = await reconcileGuildInvites(guild);
  if (credits.length > 0) {
    logger.info(
      { guild: guild.name, credits },
      "Invites pendentes recalculados na inicialização"
    );
  }
}

/**
 * Chamado quando um novo membro entra. Faz a mesma reconciliação por delta —
 * funciona corretamente mesmo se mais de um invite tiver subido entre uma
 * checagem e outra (cada criador recebe exatamente a diferença real dele,
 * em vez de sempre creditar só +1 para o primeiro link que bateu).
 */
export async function handleMemberAdd(guild: Guild, newMemberId: string): Promise<void> {
  try {
    const credits = await reconcileGuildInvites(guild);
    if (credits.length > 0) {
      logger.info({ newMemberId, credits }, "Invite rastreado no guildMemberAdd");
    }
  } catch (err) {
    logger.warn({ err, guild: guild.name }, "Falha ao rastrear invite no guildMemberAdd");
  }
}
