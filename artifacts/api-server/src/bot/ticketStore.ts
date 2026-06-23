export interface TicketMeta {
  openerId: string;
  openerTag: string;
  typeLabel: string;
  openedAt: Date;
  rating?: number;
  thumbnailUrl?: string;
}

// channelId → metadata do ticket
export const ticketStore = new Map<string, TicketMeta>();

// guildId → configuração do painel (thumbnail global do servidor)
export const ticketPanelConfig = new Map<string, { thumbnailUrl?: string }>();
