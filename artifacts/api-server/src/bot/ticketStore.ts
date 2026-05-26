export interface TicketMeta {
  openerId: string;
  openerTag: string;
  typeLabel: string;
  openedAt: Date;
  rating?: number;
}

export const ticketStore = new Map<string, TicketMeta>();
