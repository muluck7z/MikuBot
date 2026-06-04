export interface SorteioEntry {
  premio: string;
  channelId: string;
  messageId: string;
  guildId: string;
  numGanhadores: number;
  endsAt: number;
  participantes: Set<string>;
  criadorId: string;
  timer: ReturnType<typeof setTimeout>;
  encerrado: boolean;
}

// messageId → entry (inclui encerrados para permitir resorteio)
export const sorteioStore = new Map<string, SorteioEntry>();

// channelId → messageId (somente sorteios ativos)
export const sorteioByChannel = new Map<string, string>();

// channelId → messageId (último sorteio encerrado naquele canal)
export const lastEncerradoByChannel = new Map<string, string>();
