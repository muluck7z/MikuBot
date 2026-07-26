import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Salva os dados no mesmo diretório do processo
const DATA_FILE = path.join(process.cwd(), "economy_data.json");

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Loan {
  id: string;
  amount: number;
  total: number;   // valor com juros a pagar
  takenAt: number; // timestamp ms
  dueAt: number;   // timestamp ms
  paid: boolean;
}

export interface Investment {
  id: string;
  amount: number;
  returnAmount: number;
  investedAt: number;
  matureAt: number;
  collected: boolean;
}

export interface UserEconomy {
  fichas: number;
  pendingInvites: number; // invites não convertidos
  loans: Loan[];
  investments: Investment[];
}

type EconomyData = Record<string, UserEconomy>;

// ─── Opções de investimento ───────────────────────────────────────────────────

export const INVESTMENT_OPTIONS = [
  { label: "12 horas — 10% de retorno", hours: 12, rate: 0.1 },
  { label: "24 horas — 20% de retorno", hours: 24, rate: 0.2 },
  { label: "72 horas — 50% de retorno", hours: 72, rate: 0.5 },
] as const;

// ─── Persistência JSON ────────────────────────────────────────────────────────

let _data: EconomyData = {};

function loadData(): void {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      _data = JSON.parse(raw) as EconomyData;
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

// Carrega na importação
loadData();

// ─── Getters / inicializadores ────────────────────────────────────────────────

export function getUser(userId: string): UserEconomy {
  if (!_data[userId]) {
    _data[userId] = {
      fichas: 0,
      pendingInvites: 0,
      loans: [],
      investments: [],
    };
  }
  return _data[userId]!;
}

// ─── Invites ──────────────────────────────────────────────────────────────────

/** Adiciona 1 invite pendente para o usuário (chamado quando alguém entra via link dele). */
export function addPendingInvite(userId: string): void {
  const user = getUser(userId);
  user.pendingInvites++;
  saveData();
}

/** Converte todos os invites pendentes em fichas. Retorna null se não houver nenhum. */
export function convertInvites(
  userId: string
): { converted: number; fichasEarned: number } | null {
  const user = getUser(userId);
  if (user.pendingInvites <= 0) return null;
  const converted = user.pendingInvites;
  const fichasEarned = converted * 20;
  user.fichas += fichasEarned;
  user.pendingInvites = 0;
  saveData();
  return { converted, fichasEarned };
}

// ─── Transferências ───────────────────────────────────────────────────────────

/** Transfere fichas de um usuário para outro. Retorna false se saldo insuficiente. */
export function transfer(fromId: string, toId: string, amount: number): boolean {
  const from = getUser(fromId);
  if (from.fichas < amount) return false;
  const to = getUser(toId);
  from.fichas -= amount;
  to.fichas += amount;
  saveData();
  return true;
}

// ─── Empréstimos ──────────────────────────────────────────────────────────────

const LOAN_INTEREST = 0.3; // 30%
const LOAN_DAYS = 7;       // 7 dias de prazo

export function takeLoan(userId: string, amount: number): Loan {
  const user = getUser(userId);
  const total = Math.ceil(amount * (1 + LOAN_INTEREST));
  const now = Date.now();
  const loan: Loan = {
    id: now.toString(),
    amount,
    total,
    takenAt: now,
    dueAt: now + LOAN_DAYS * 24 * 60 * 60 * 1000,
    paid: false,
  };
  user.fichas += amount;
  user.loans.push(loan);
  saveData();
  return loan;
}

/**
 * Paga um empréstimo específico.
 * Retorna "ok" em sucesso, "not_found" se não existir, "insufficient" se saldo baixo.
 */
export function payLoan(
  userId: string,
  loanId: string
): "ok" | "not_found" | "insufficient" {
  const user = getUser(userId);
  const loan = user.loans.find((l) => l.id === loanId && !l.paid);
  if (!loan) return "not_found";
  if (user.fichas < loan.total) return "insufficient";
  user.fichas -= loan.total;
  loan.paid = true;
  saveData();
  return "ok";
}

// ─── Investimentos ────────────────────────────────────────────────────────────

/**
 * Investe fichas com base na opção escolhida (índice de INVESTMENT_OPTIONS).
 * Retorna null se saldo insuficiente ou opção inválida.
 */
export function invest(
  userId: string,
  amount: number,
  optionIndex: number
): Investment | null {
  const option = INVESTMENT_OPTIONS[optionIndex];
  if (!option) return null;
  const user = getUser(userId);
  if (user.fichas < amount) return null;
  const returnAmount = Math.ceil(amount * (1 + option.rate));
  const now = Date.now();
  const investment: Investment = {
    id: now.toString(),
    amount,
    returnAmount,
    investedAt: now,
    matureAt: now + option.hours * 60 * 60 * 1000,
    collected: false,
  };
  user.fichas -= amount;
  user.investments.push(investment);
  saveData();
  return investment;
}

/**
 * Coleta automaticamente todos os investimentos vencidos do usuário.
 * Retorna o total de fichas coletadas (0 se nenhum venceu).
 */
export function collectMaturedInvestments(userId: string): number {
  const user = getUser(userId);
  const now = Date.now();
  let total = 0;
  for (const inv of user.investments) {
    if (!inv.collected && inv.matureAt <= now) {
      inv.collected = true;
      total += inv.returnAmount;
    }
  }
  if (total > 0) {
    user.fichas += total;
    saveData();
  }
  return total;
}
