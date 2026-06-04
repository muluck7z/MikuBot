export type CargoStep = "titulo" | "descricao" | "cor" | "cargos" | "canal";

export interface CargoEntry {
  emoji: string;      // exibição: "🎉" ou "<:nome:id>"
  emojiKey: string;   // chave para o reactionRoleStore
  roleId: string;
  roleName: string;
}

export interface CargoSession {
  step: CargoStep;
  guildId: string;
  setupChannelId: string; // canal onde !cargo foi digitado
  titulo: string;
  descricao: string;
  cor: number;            // cor em inteiro hex
  cargos: CargoEntry[];
}

// userId → sessão ativa
export const cargoSessions = new Map<string, CargoSession>();
