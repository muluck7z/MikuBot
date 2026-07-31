import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { type BotCommand } from "../index";
import { infoContainer, errorContainer, v2Reply, COLORS } from "../v2/index";

interface RobloxUserLookup {
  id: number;
  name: string;
  displayName: string;
}

interface RobloxUserDetails {
  description: string;
  created: string;
  isBanned: boolean;
}

interface RobloxGroupEntry {
  group: { name: string };
  role: { name: string };
}

interface RobloxGameEntry {
  name: string;
  placeVisits: number;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Resolve um username Roblox para o objeto básico {id, name, displayName}. */
async function lookupUser(username: string): Promise<RobloxUserLookup | null> {
  const data = await fetchJson<{ data: RobloxUserLookup[] }>(
    "https://users.roblox.com/v1/usernames/users",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    }
  );
  return data?.data?.[0] ?? null;
}

/** Diz se o inventário está com a privacidade aberta ("Todos") ou fechada. */
async function fetchCanViewInventory(userId: number): Promise<boolean | null> {
  const data = await fetchJson<{ canView: boolean }>(
    `https://inventory.roblox.com/v1/users/${userId}/can-view-inventory`
  );
  return data ? data.canView : null;
}

/**
 * Soma o RAP (Recent Average Price) dos itens colecionáveis (limiteds).
 * Só retorna algo se o inventário estiver público.
 */
async function fetchRap(userId: number): Promise<number | null> {
  let cursor = "";
  let rap = 0;
  let pages = 0;
  let sawAnyPage = false;

  do {
    const url = `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&sortOrder=Asc${cursor ? `&cursor=${cursor}` : ""}`;
    const data = await fetchJson<{ data: { recentAveragePrice: number }[]; nextPageCursor: string | null }>(url);
    if (!data) return sawAnyPage ? rap : null;
    sawAnyPage = true;
    for (const item of data.data) rap += item.recentAveragePrice || 0;
    cursor = data.nextPageCursor || "";
    pages++;
  } while (cursor && pages < 5);

  return rap;
}

/** Soma as visitas dos jogos públicos criados pelo usuário (primeira página, até 50 jogos). */
async function fetchTotalVisits(userId: number): Promise<number | null> {
  const data = await fetchJson<{ data: RobloxGameEntry[] }>(
    `https://games.roblox.com/v2/users/${userId}/games?accessFilter=Public&limit=50&sortOrder=Asc`
  );
  if (!data) return null;
  return data.data.reduce((sum, g) => sum + (g.placeVisits || 0), 0);
}

function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "Indisponível";
  return n.toLocaleString("pt-BR");
}

export const robloxCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("roblox")
    .setDescription("Mostra as informações públicas de uma conta Roblox")
    .addStringOption((opt) =>
      opt.setName("usuario").setDescription("Nome de usuário do Roblox").setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const username = interaction.options.getString("usuario", true).trim();

    const basic = await lookupUser(username);
    if (!basic) {
      await interaction.editReply(
        v2Reply([errorContainer(`Não encontrei nenhuma conta Roblox com o nome \`${username}\`.`)])
      );
      return;
    }

    const { id } = basic;

    const [details, avatar, friendsCount, followersCount, followingsCount, groups, canViewInventory, visits] =
      await Promise.all([
        fetchJson<RobloxUserDetails>(`https://users.roblox.com/v1/users/${id}`),
        fetchJson<{ data: { imageUrl: string }[] }>(
          `https://thumbnails.roblox.com/v1/users/avatar?userIds=${id}&size=420x420&format=Png&isCircular=false`
        ),
        fetchJson<{ count: number }>(`https://friends.roblox.com/v1/users/${id}/friends/count`),
        fetchJson<{ count: number }>(`https://friends.roblox.com/v1/users/${id}/followers/count`),
        fetchJson<{ count: number }>(`https://friends.roblox.com/v1/users/${id}/followings/count`),
        fetchJson<{ data: RobloxGroupEntry[] }>(`https://groups.roblox.com/v1/users/${id}/groups/roles`),
        fetchCanViewInventory(id),
        fetchTotalVisits(id),
      ]);

    // RAP só faz sentido buscar se o inventário estiver aberto.
    const rap = canViewInventory ? await fetchRap(id) : null;

    const createdDate = details?.created ? new Date(details.created) : null;
    const createdTimestamp = createdDate ? Math.floor(createdDate.getTime() / 1000) : null;
    const daysSinceCreation = createdDate
      ? Math.floor((Date.now() - createdDate.getTime()) / 86_400_000)
      : null;

    const groupList =
      groups?.data && groups.data.length > 0
        ? groups.data
            .slice(0, 10)
            .map((g) => `${g.group.name} (${g.role.name})`)
            .join(", ")
        : "Nenhum";

    const bio = details?.description?.trim() ? details.description.trim().slice(0, 300) : "Sem biografia";

    const inventarioStatus =
      canViewInventory === null ? "Indisponível" : canViewInventory ? "Público" : "Privado";

    const body = [
      [
        `**Username:** \`${basic.name}\``,
        `**Display name:** ${basic.displayName}`,
        `**Visitas:** ${formatNumber(visits)}`,
        `**ID:** \`${id}\``,
        `[Perfil](https://www.roblox.com/users/${id}/profile)`,
      ].join("\n"),

      [
        `**RAP:** ${canViewInventory ? `${formatNumber(rap)} R$` : "Indisponível (inventário privado)"}`,
        `**Inventário:** ${inventarioStatus}`,
      ].join("\n"),

      [
        `**Data de criação:** ${createdTimestamp ? `<t:${createdTimestamp}:D>` : "Desconhecido"}`,
        `**Dias desde a criação:** ${daysSinceCreation !== null ? formatNumber(daysSinceCreation) : "Desconhecido"}`,
      ].join("\n"),

      [
        `**Amigos:** ${formatNumber(friendsCount?.count)}`,
        `**Seguidores:** ${formatNumber(followersCount?.count)}`,
        `**Seguindo:** ${formatNumber(followingsCount?.count)}`,
      ].join("\n"),

      `**Grupos:** ${groupList}`,

      `**Descrição:** ${bio}`,
    ]
      .map((block) =>
        block
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")
      )
      .join("\n\n");

    await interaction.editReply(
      v2Reply([
        infoContainer({
          title: `<:comunidade2:1531072981688914103> ROBLOX`,
          description: body,
          avatarUrl: avatar?.data?.[0]?.imageUrl ?? null,
          accentColor: COLORS.primary,
        }),
      ])
    );
  },
};
