export interface ReactionRole {
  guildId: string;
  channelId: string;
  messageId: string;
  /** Chave normalizada: ID do emoji customizado ou o próprio unicode */
  emojiKey: string;
  /** Texto de exibição (ex: "🎉" ou "<:nome:id>") */
  emojiDisplay: string;
  roleId: string;
}

// Chave do mapa: `${messageId}-${emojiKey}`
export const reactionRoleStore = new Map<string, ReactionRole>();

export function makeKey(messageId: string, emojiKey: string): string {
  return `${messageId}-${emojiKey}`;
}

/**
 * Normaliza o input do usuário para uma chave e um texto de exibição.
 * Aceita emoji unicode (🎉) ou emoji customizado (<:nome:id> / <a:nome:id>).
 */
export function parseEmojiInput(input: string): { key: string; display: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Emoji customizado: <:nome:id> ou <a:nome:id>
  const customMatch = trimmed.match(/^<a?:\w+:(\d+)>$/);
  if (customMatch) {
    return { key: customMatch[1]!, display: trimmed };
  }

  // Emoji unicode — aceita qualquer string não vazia
  return { key: trimmed, display: trimmed };
}

/**
 * Resolve a chave do emoji a partir de um objeto de emoji do discord.js.
 * Retorna o ID do emoji customizado, ou o nome para unicode.
 */
export function emojiKeyFromReaction(emoji: { id: string | null; name: string | null }): string {
  return emoji.id ?? emoji.name ?? "";
}
