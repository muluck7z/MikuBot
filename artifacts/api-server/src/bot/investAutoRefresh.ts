import type { ButtonInteraction, ModalSubmitInteraction } from "discord.js";
import { renderInvestir } from "./bancoViews";
import { processAccount } from "./economyStore";

/**
 * Mantém a tela de "Investir" se auto-atualizando (valor, variação e o
 * countdown) editando a mensagem a cada REFRESH_INTERVAL_MS, sem precisar
 * que o usuário saia e volte para a área.
 *
 * Um timer por mensagem: sempre que o usuário navega pra outra tela do banco,
 * o timer daquela mensagem é cancelado (clearInvestAutoRefresh). Sempre que
 * a tela de investir é renderizada de novo, o timer é (re)criado do zero.
 */

const REFRESH_INTERVAL_MS = 10_000;
// segurança: se o usuário sumir sem trocar de tela (ex: fechar o Discord),
// para de editar depois de um tempo em vez de rodar pra sempre.
const MAX_REFRESH_MINUTES = 30;
const MAX_TICKS = Math.floor((MAX_REFRESH_MINUTES * 60_000) / REFRESH_INTERVAL_MS);

interface RefreshEntry {
  interval: NodeJS.Timeout;
  ticks: number;
}

const activeRefreshers = new Map<string, RefreshEntry>();

/** Cancela o auto-refresh de uma mensagem (chamar ao sair da tela de Investir). */
export function clearInvestAutoRefresh(messageId: string | undefined | null): void {
  if (!messageId) return;
  const entry = activeRefreshers.get(messageId);
  if (entry) {
    clearInterval(entry.interval);
    activeRefreshers.delete(messageId);
  }
}

/** (Re)inicia o auto-refresh de 10 em 10s pra mensagem da interação atual. */
export function scheduleInvestAutoRefresh(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  userId: string
): void {
  const message = interaction.message;
  if (!message) return;

  // se já tinha um timer rodando nessa mensagem, reinicia do zero
  clearInvestAutoRefresh(message.id);

  const entry: RefreshEntry = {
    ticks: 0,
    interval: setInterval(() => {
      void (async () => {
        entry.ticks += 1;

        const user = processAccount(userId);
        const stillRelevant = user.investment.active && !user.bankLocked;

        try {
          await message.edit(renderInvestir(userId) as never);
        } catch {
          // mensagem apagada, sem permissão, canal sumiu, etc — desiste
          clearInvestAutoRefresh(message.id);
          return;
        }

        if (!stillRelevant || entry.ticks >= MAX_TICKS) {
          clearInvestAutoRefresh(message.id);
        }
      })();
    }, REFRESH_INTERVAL_MS),
  };

  activeRefreshers.set(message.id, entry);
}
