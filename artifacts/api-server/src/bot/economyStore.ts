import fs from "fs";
import { dataFilePath } from "./dataDir";

// Salva os dados num diretório persistente (ver dataDir.ts) — assim eles
// sobrevivem a deploys e restarts no Railway, desde que um Volume esteja
// anexado ao serviço.
const DATA_FILE = dataFilePath("economy_data.json");

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const INVEST_TICK_MS = 1 * 60 * 1000; // mercado de investimentos atualiza a cada 1 minuto

// ─── Configurações do banco ────────────────────────────────────────────────────

export const MAX_LOAN_AMOUNT = 50000; // valor máximo que pode ser pego por empréstimo

export const INVITE_VALUE = 200; // fichas por invite convertido
export const LOAN_INTEREST = 0.3; // 30% de juros ao pegar o empréstimo
export const LOAN_DUE_DAYS = 10; // prazo original para pagar
export const LOAN_LOCK_DAYS = 20; // dias (desde a retirada) até a conta ser fechada
export const LOAN_LATE_DAILY_RATE = 0.05; // juros extra por dia de atraso (após o vencimento)
export const MAX_ACTIVE_LOANS = 2;
export const UNLOCK_THRESHOLD = 0.3; // 30% da dívida travada precisa ser paga para desbloquear

const MAX_INVESTMENT_TICKS = 4320; // limite de "ticks" de 10min simulados de uma vez (proteção, ~30 dias)

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Loan {
  id: string;
  amount: number; // valor original emprestado
  total: number; // valor atual a devolver (cresce com atraso)
  takenAt: number; // timestamp ms
  dueAt: number; // timestamp ms — prazo original
  lastAccrualAt: number; // último momento em que os juros de atraso foram aplicados
  paid: boolean;
}

export interface InvestmentPortfolio {
  active: boolean;
  deposited: number; // total investido (referência para a volatilidade)
  balance: number; // valor atual (pode ficar negativo)
  lastUpdate: number; // timestamp da última atualização de mercado
  lastChangePct: number; // última variação percentual aplicada (para exibição)
  history: number[]; // últimas variações percentuais aplicadas (mais recente por último)
}

// quantas variações recentes guardamos para exibir o histórico ao usuário
const INVEST_HISTORY_LENGTH = 10;

export interface UserEconomy {
  fichas: number;
  pendingInvites: number; // invites não convertidos
  loans: Loan[];
  investment: InvestmentPortfolio;
  bankLocked: boolean;
  lockDebt: number; // dívida total no momento em que a conta foi fechada
  unlockPaid: number; // quanto já foi pago desde o bloqueio, rumo ao desbloqueio
}

type EconomyData = Record<string, UserEconomy>;

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

loadData();

// ─── Getters / inicializadores ────────────────────────────────────────────────

function freshUser(): UserEconomy {
  return {
    fichas: 0,
    pendingInvites: 0,
    loans: [],
    investment: {
      active: false,
      deposited: 0,
      balance: 0,
      lastUpdate: Date.now(),
      lastChangePct: 0,
      history: [],
    },
    bankLocked: false,
    lockDebt: 0,
    unlockPaid: 0,
  };
}

/** Retorna o usuário (sem processar juros/mercado — use processAccount para isso). */
export function getUser(userId: string): UserEconomy {
  if (!_data[userId]) {
    _data[userId] = freshUser();
  }
  // Compatibilidade com dados antigos (retrocompatibilidade defensiva)
  const u = _data[userId]!;
  if (!u.investment) {
    u.investment = { active: false, deposited: 0, balance: 0, lastUpdate: Date.now(), lastChangePct: 0, history: [] };
  }
  if (!u.investment.history) u.investment.history = [];
  if (u.bankLocked === undefined) u.bankLocked = false;
  if (u.lockDebt === undefined) u.lockDebt = 0;
  if (u.unlockPaid === undefined) u.unlockPaid = 0;
  return u;
}

export function activeLoans(user: UserEconomy): Loan[] {
  return user.loans.filter((l) => !l.paid);
}

export function totalDebt(user: UserEconomy): number {
  return activeLoans(user).reduce((sum, l) => sum + l.total, 0);
}

// ─── Processamento de conta (juros, bloqueio, mercado) ────────────────────────

/**
 * Aplica juros de atraso nos empréstimos, verifica se a conta deve ser fechada
 * e atualiza o mercado de investimentos. Deve ser chamada sempre antes de
 * exibir/usar dados do banco para o usuário.
 */
export function processAccount(userId: string): UserEconomy {
  const user = getUser(userId);
  const now = Date.now();

  // Juros de atraso
  for (const loan of user.loans) {
    if (loan.paid) continue;
    if (now <= loan.dueAt) continue;

    const daysLate = Math.floor((now - loan.lastAccrualAt) / DAY_MS);
    if (daysLate > 0) {
      for (let i = 0; i < daysLate; i++) {
        loan.total = Math.ceil(loan.total * (1 + LOAN_LATE_DAILY_RATE));
      }
      loan.lastAccrualAt += daysLate * DAY_MS;
    }
  }

  // Fechamento da conta por atraso excessivo
  if (!user.bankLocked) {
    const overdueLoan = user.loans.find(
      (l) => !l.paid && now - l.takenAt >= LOAN_LOCK_DAYS * DAY_MS
    );
    if (overdueLoan) {
      user.bankLocked = true;
      user.lockDebt = totalDebt(user);
      user.unlockPaid = 0;
      user.fichas = 0; // todo o dinheiro na conta é confiscado
    }
  }

  // Mercado de investimentos
  updateInvestment(user);

  saveData();
  return user;
}

// ─── Invites ──────────────────────────────────────────────────────────────────

/** Adiciona invite(s) pendente(s) para o usuário (chamado quando alguém entra via link dele). */
export function addPendingInvite(userId: string, amount: number = 1): void {
  if (amount <= 0) return;
  const user = getUser(userId);
  user.pendingInvites += amount;
  saveData();
}

/**
 * Converte uma quantidade específica de invites pendentes em fichas
 * (1 invite = INVITE_VALUE fichas). Funciona mesmo com a conta bloqueada —
 * é o único jeito de recuperar fichas nesse caso.
 */
export function convertInvites(
  userId: string,
  amount: number
): { converted: number; fichasEarned: number } | null {
  const user = getUser(userId);
  if (!Number.isFinite(amount) || amount < 1) return null;
  if (user.pendingInvites < amount) return null;
  const fichasEarned = amount * INVITE_VALUE;
  user.pendingInvites -= amount;
  user.fichas += fichasEarned;
  saveData();
  return { converted: amount, fichasEarned };
}

// ─── Empréstimos ──────────────────────────────────────────────────────────────

export type TakeLoanResult =
  | { ok: true; loan: Loan }
  | { ok: false; reason: "locked" | "max_loans" | "invalid_amount" };

export function takeLoan(userId: string, amount: number): TakeLoanResult {
  const user = getUser(userId);
  if (!Number.isFinite(amount) || amount < 1 || amount > MAX_LOAN_AMOUNT) {
    return { ok: false, reason: "invalid_amount" };
  }
  if (user.bankLocked) return { ok: false, reason: "locked" };
  if (activeLoans(user).length >= MAX_ACTIVE_LOANS) {
    return { ok: false, reason: "max_loans" };
  }

  const now = Date.now();
  const dueAt = now + LOAN_DUE_DAYS * DAY_MS;
  const loan: Loan = {
    id: now.toString(),
    amount,
    total: Math.ceil(amount * (1 + LOAN_INTEREST)),
    takenAt: now,
    dueAt,
    lastAccrualAt: dueAt, // juros de atraso só começam a contar após o vencimento
    paid: false,
  };
  user.fichas += amount;
  user.loans.push(loan);
  saveData();
  return { ok: true, loan };
}

/**
 * Paga dívidas com as fichas disponíveis (a mais antiga primeiro). Paga o
 * máximo possível até `amount` fichas. Se a conta estiver bloqueada e o total
 * pago desde o bloqueio atingir 30% da dívida travada, a conta é desbloqueada.
 */
export function payDebts(
  userId: string,
  amount: number
): { paid: number; unlocked: boolean; remainingDebt: number } | null {
  const user = getUser(userId);
  if (amount <= 0) return null;
  if (user.fichas < amount) return null;

  const unpaid = activeLoans(user).sort((a, b) => a.takenAt - b.takenAt);
  if (unpaid.length === 0) return null;

  let remaining = amount;
  let paidTotal = 0;

  for (const loan of unpaid) {
    if (remaining <= 0) break;
    const payment = Math.min(remaining, loan.total);
    loan.total -= payment;
    remaining -= payment;
    paidTotal += payment;
    if (loan.total <= 0) {
      loan.total = 0;
      loan.paid = true;
    }
  }

  user.fichas -= paidTotal;

  let unlocked = false;
  if (user.bankLocked) {
    user.unlockPaid += paidTotal;
    if (user.unlockPaid >= user.lockDebt * UNLOCK_THRESHOLD) {
      user.bankLocked = false;
      user.lockDebt = 0;
      user.unlockPaid = 0;
      unlocked = true;
    }
  }

  saveData();
  return { paid: paidTotal, unlocked, remainingDebt: totalDebt(user) };
}

// ─── Investimento (mercado global, contínuo) ───────────────────────────────────
//
// O mercado é o mesmo para todo mundo: a variação de cada "hora" (bucket de
// tempo) é calculada de forma determinística a partir do horário, então dois
// usuários que consultam o mesmo período sempre veem a mesma variação —
// ninguém tem sorte diferente de ninguém.

/** PRNG determinístico simples (mulberry32), seedado por um inteiro. */
function seededRandom(seed: number): number {
  let t = (seed >>> 0) + 0x6d2b79f5;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}

/** Variação do mercado para um "bucket" de 10 minutos específico — igual para todos. */
function marketPctForBucket(bucket: number): number {
  const r1 = seededRandom(bucket);
  // Proporções pedidas eram 35 / 35 / 25 / 15 (somam 110) — normalizadas para somar 100%:
  // ~31.82% / ~31.82% / ~22.73% / ~13.64%
  if (r1 < 0.318182) return 0.1; // subiu 10%
  if (r1 < 0.636364) return -0.1; // caiu 10%

  const r2 = seededRandom(bucket ^ 0x5bd1e995); // magnitude, decorrelacionada
  const r3 = seededRandom(bucket ^ 0x27d4eb2f); // sinal, decorrelacionada
  const sign = r3 < 0.5 ? -1 : 1;

  if (r1 < 0.863636) {
    // variação entre 20% e 50%, positiva ou negativa
    const magnitude = 0.2 + r2 * 0.3;
    return sign * magnitude;
  }

  // variação entre 60% e 100%, positiva ou negativa
  const magnitude = 0.6 + r2 * 0.4;
  return sign * magnitude;
}

/** Simula as variações de mercado (globais) que aconteceram desde a última atualização. */
function updateInvestment(user: UserEconomy): void {
  const inv = user.investment;
  if (!inv.active) return;

  const now = Date.now();
  const currentBucket = Math.floor(now / INVEST_TICK_MS);
  let lastBucket = Math.floor(inv.lastUpdate / INVEST_TICK_MS);
  let ticks = currentBucket - lastBucket;
  if (ticks <= 0) return;

  if (ticks > MAX_INVESTMENT_TICKS) {
    lastBucket = currentBucket - MAX_INVESTMENT_TICKS;
    ticks = MAX_INVESTMENT_TICKS;
  }

  let lastPct = inv.lastChangePct;
  for (let b = lastBucket + 1; b <= lastBucket + ticks; b++) {
    lastPct = marketPctForBucket(b);
    const delta = Math.round(inv.deposited * lastPct);
    inv.balance += delta;
    inv.history.push(lastPct);
  }
  if (inv.history.length > INVEST_HISTORY_LENGTH) {
    inv.history = inv.history.slice(inv.history.length - INVEST_HISTORY_LENGTH);
  }
  inv.lastChangePct = lastPct;
  inv.lastUpdate = (lastBucket + ticks) * INVEST_TICK_MS;
}

export type InvestResult =
  | { ok: true; portfolio: InvestmentPortfolio }
  | { ok: false; reason: "locked" | "insufficient" };

/** Investe (ou adiciona a um investimento já ativo). */
export function investFichas(userId: string, amount: number): InvestResult {
  const user = processAccount(userId);
  if (!Number.isFinite(amount) || amount < 1) return { ok: false, reason: "insufficient" };
  if (user.bankLocked) return { ok: false, reason: "locked" };
  if (user.fichas < amount) return { ok: false, reason: "insufficient" };

  const inv = user.investment;
  user.fichas -= amount;
  if (!inv.active) {
    inv.active = true;
    inv.deposited = amount;
    inv.balance = amount;
    inv.lastUpdate = Date.now();
    inv.lastChangePct = 0;
    inv.history = [];
  } else {
    inv.deposited += amount;
    inv.balance += amount;
  }
  saveData();
  return { ok: true, portfolio: inv };
}

export type WithdrawResult =
  | { ok: true; amount: number }
  | { ok: false; reason: "not_active" };

/** Saca todo o valor investido (pode ser negativo — o usuário fica devendo). */
export function withdrawInvestment(userId: string): WithdrawResult {
  const user = processAccount(userId);
  const inv = user.investment;
  if (!inv.active) return { ok: false, reason: "not_active" };

  const amount = inv.balance;
  user.fichas += amount;
  inv.active = false;
  inv.deposited = 0;
  inv.balance = 0;
  inv.lastChangePct = 0;
  inv.history = [];
  saveData();
  return { ok: true, amount };
}

export type WithdrawPartialResult =
  | { ok: true; amount: number; closed: boolean; remainingBalance: number }
  | { ok: false; reason: "not_active" | "negative_balance" | "invalid_amount" };

/**
 * Saca um valor específico do investimento (escolhido pelo usuário no modal).
 * Se o valor pedido for maior ou igual ao saldo, encerra o investimento
 * (mesmo comportamento de withdrawInvestment). Caso contrário, saca só a
 * parte pedida e reduz `deposited` na mesma proporção, para manter a
 * volatilidade futura consistente com o que ainda está investido.
 * Não é possível sacar parcialmente quando o saldo já está negativo — nesse
 * caso só dá pra encerrar o investimento por completo (ver withdrawInvestment).
 */
export function withdrawPartial(userId: string, amount: number): WithdrawPartialResult {
  const user = processAccount(userId);
  const inv = user.investment;
  if (!inv.active) return { ok: false, reason: "not_active" };
  if (!Number.isFinite(amount) || amount < 1) return { ok: false, reason: "invalid_amount" };
  if (inv.balance <= 0) return { ok: false, reason: "negative_balance" };

  if (amount >= inv.balance) {
    const withdrawn = inv.balance;
    user.fichas += withdrawn;
    inv.active = false;
    inv.deposited = 0;
    inv.balance = 0;
    inv.lastChangePct = 0;
    inv.history = [];
    saveData();
    return { ok: true, amount: withdrawn, closed: true, remainingBalance: 0 };
  }

  const proportion = amount / inv.balance;
  inv.deposited = Math.round(inv.deposited * (1 - proportion));
  inv.balance -= amount;
  user.fichas += amount;
  saveData();
  return { ok: true, amount, closed: false, remainingBalance: inv.balance };
}

// ─── Transferências entre usuários (Pix) ───────────────────────────────────────

export type TransferResult =
  | { ok: true; amount: number }
  | { ok: false; reason: "invalid_amount" | "insufficient" | "locked" | "same_user" };

/**
 * Transfere fichas de um usuário para outro (comando /pix). O remetente
 * precisa ter saldo suficiente e a conta não pode estar bloqueada.
 */
export function transferFichas(fromUserId: string, toUserId: string, amount: number): TransferResult {
  if (fromUserId === toUserId) return { ok: false, reason: "same_user" };
  if (!Number.isFinite(amount) || amount < 1) return { ok: false, reason: "invalid_amount" };

  const from = processAccount(fromUserId);
  if (from.bankLocked) return { ok: false, reason: "locked" };
  if (from.fichas < amount) return { ok: false, reason: "insufficient" };

  const to = processAccount(toUserId);
  from.fichas -= amount;
  to.fichas += amount;
  saveData();
  return { ok: true, amount };
}

// ─── Concessão administrativa de fichas ────────────────────────────────────────

export type GiveResult =
  | { ok: true; amount: number; newBalance: number }
  | { ok: false; reason: "invalid_amount" };

/** Dá fichas a um usuário "do nada" (sem debitar de ninguém) — uso restrito. */
export function giveFichas(userId: string, amount: number): GiveResult {
  if (!Number.isFinite(amount) || amount < 1) return { ok: false, reason: "invalid_amount" };
  const user = processAccount(userId);
  user.fichas += amount;
  saveData();
  return { ok: true, amount, newBalance: user.fichas };
}
