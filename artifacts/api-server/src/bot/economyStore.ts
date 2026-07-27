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

// Enquanto o usuário tem dívida de empréstimo ativa, o banco fica mais rígido
// com transferências: só permite valores menores que esse teto, e só uma vez
// por dia (24h). Não afeta usuários sem dívida ativa.
export const DEBT_TRANSFER_MAX_AMOUNT = 2000; // transferências precisam ser < 2000 fichas
export const DEBT_TRANSFER_COOLDOWN_MS = DAY_MS; // 1 transferência a cada 24h

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

// ─── Configurações do cassino (Roleta Brazino 777) ─────────────────────────────

export const ROLETA_NUMEROS = 15; // números de 1 a 15, em branco e em preto (30 posições)
export const DEFAULT_BET_PER_ROUND = 10; // valor padrão de aposta por rodada
export type RoletaCor = "branco" | "preto";

export interface CassinoLastResult {
  cor: RoletaCor; // cor sorteada na roleta
  numero: number; // número sorteado na roleta
  outcome: "cor" | "perde" | "jackpot" | "catastrofe";
  amount: number; // quanto foi ganho ou perdido nessa rodada (sempre positivo)
  won: boolean;
}

export interface CassinoState {
  banca: number; // fichas depositadas na mesa (sobe a cada clique em "Depositar")
  betPerRound: number; // valor apostado por rodada (configurado em "Rodada")
  lastResult: CassinoLastResult | null; // resultado da última rodada, exibido no painel
}

export interface UserEconomy {
  fichas: number;
  pendingInvites: number; // invites não convertidos
  loans: Loan[];
  investment: InvestmentPortfolio;
  cassino: CassinoState;
  bankLocked: boolean;
  lockDebt: number; // dívida total no momento em que a conta foi fechada
  unlockPaid: number; // quanto já foi pago desde o bloqueio, rumo ao desbloqueio
  lastTransferAt: number; // timestamp ms da última transferência enviada (usado para limitar envios enquanto há dívida ativa)
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
    cassino: { banca: 0, betPerRound: DEFAULT_BET_PER_ROUND, lastResult: null },
    bankLocked: false,
    lockDebt: 0,
    unlockPaid: 0,
    lastTransferAt: 0,
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
  if (u.lastTransferAt === undefined) u.lastTransferAt = 0;
  if (!u.cassino) u.cassino = { banca: 0, betPerRound: DEFAULT_BET_PER_ROUND, lastResult: null };
  if (u.cassino.lastResult === undefined) u.cassino.lastResult = null;
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
  | {
      ok: false;
      reason:
        | "invalid_amount"
        | "insufficient"
        | "locked"
        | "same_user"
        | "debt_amount_too_high"
        | "debt_cooldown";
      retryAt?: number; // timestamp ms em que o próximo envio será liberado (só para "debt_cooldown")
    };

/**
 * Transfere fichas de um usuário para outro (comando /pix). O remetente
 * precisa ter saldo suficiente e a conta não pode estar bloqueada.
 *
 * Enquanto o remetente tiver dívida de empréstimo ativa, o banco impõe
 * regras extras: só é possível enviar valores abaixo de
 * DEBT_TRANSFER_MAX_AMOUNT, e apenas uma vez a cada DEBT_TRANSFER_COOLDOWN_MS
 * (24h). Essas restrições não se aplicam a usuários sem dívida ativa.
 */
export function transferFichas(fromUserId: string, toUserId: string, amount: number): TransferResult {
  if (fromUserId === toUserId) return { ok: false, reason: "same_user" };
  if (!Number.isFinite(amount) || amount < 1) return { ok: false, reason: "invalid_amount" };

  const from = processAccount(fromUserId);
  if (from.bankLocked) return { ok: false, reason: "locked" };

  if (totalDebt(from) > 0) {
    if (amount >= DEBT_TRANSFER_MAX_AMOUNT) {
      return { ok: false, reason: "debt_amount_too_high" };
    }
    const elapsed = Date.now() - from.lastTransferAt;
    if (from.lastTransferAt > 0 && elapsed < DEBT_TRANSFER_COOLDOWN_MS) {
      return { ok: false, reason: "debt_cooldown", retryAt: from.lastTransferAt + DEBT_TRANSFER_COOLDOWN_MS };
    }
  }

  if (from.fichas < amount) return { ok: false, reason: "insufficient" };

  const to = processAccount(toUserId);
  from.fichas -= amount;
  from.lastTransferAt = Date.now();
  to.fichas += amount;
  saveData();
  return { ok: true, amount };
}

// ─── Administração de saldo ────────────────────────────────────────────────────

export type AdjustResult =
  | { ok: true; requested: number; delta: number; newBalance: number }
  | { ok: false; reason: "invalid_amount" };

/**
 * Ajusta o saldo de um usuário "do nada" (sem debitar/creditar de ninguém) —
 * uso restrito. `amount` positivo adiciona fichas, negativo remove. O saldo
 * nunca fica abaixo de 0 — se `amount` negativo for maior que o saldo atual,
 * o saldo só é zerado (o `delta` retornado reflete o que de fato foi
 * removido, que pode ser menor em valor absoluto do que o `amount` pedido).
 */
export function adjustFichas(userId: string, amount: number): AdjustResult {
  if (!Number.isFinite(amount) || amount === 0) return { ok: false, reason: "invalid_amount" };
  const user = processAccount(userId);
  const before = user.fichas;
  user.fichas = Math.max(0, user.fichas + amount);
  const delta = user.fichas - before;
  saveData();
  return { ok: true, requested: amount, delta, newBalance: user.fichas };
}

// ─── Cassino Brazino 777 — Roleta ───────────────────────────────────────────────
//
// A roleta tem 30 posições: números de 1 a 15, cada um em branco ou em preto.
// O jogador escolhe uma cor e um número da sorte antes de girar. Resultado:
//   • Cor certa, número errado  → ganha o dobro do valor apostado na rodada.
//   • Cor errada, número errado → perde o valor apostado na rodada.
//   • Cor certa, número certo   → ganha 100x o valor apostado na rodada.
//   • Cor errada, número certo  → perde 100x o valor apostado na rodada. Isso é
//     descontado primeiro da banca, depois do saldo (fichas) e, se ainda faltar,
//     vira uma dívida em nome do usuário (entra no sistema de empréstimos).

/** Adiciona uma dívida "forçada" (sem juros) ao nome do usuário — ex: perda no cassino. */
function addForcedDebt(user: UserEconomy, amount: number): void {
  if (amount <= 0) return;
  const now = Date.now();
  const dueAt = now + LOAN_DUE_DAYS * DAY_MS;
  user.loans.push({
    id: `cassino-${now}-${Math.floor(Math.random() * 1000)}`,
    amount,
    total: amount,
    takenAt: now,
    dueAt,
    lastAccrualAt: dueAt,
    paid: false,
  });
}

export type DepositarCassinoResult =
  | { ok: true; added: number; banca: number; betPerRound: number }
  | { ok: false; reason: "locked" | "insufficient" | "invalid_amount" };

/** Move fichas da carteira para a banca do cassino (não mexe no valor por rodada). */
export function depositarCassino(userId: string, valor: number): DepositarCassinoResult {
  if (!Number.isFinite(valor) || valor < 1) return { ok: false, reason: "invalid_amount" };
  const user = processAccount(userId);
  if (user.bankLocked) return { ok: false, reason: "locked" };
  if (user.fichas < valor) return { ok: false, reason: "insufficient" };

  user.fichas -= valor;
  user.cassino.banca += valor;
  saveData();
  return { ok: true, added: valor, banca: user.cassino.banca, betPerRound: user.cassino.betPerRound };
}

export type ConfigurarRodadaResult =
  | { ok: true; betPerRound: number }
  | { ok: false; reason: "locked" | "invalid_amount" };

/** Define quantas fichas valem cada rodada da roleta (padrão: DEFAULT_BET_PER_ROUND). */
export function configurarRodada(userId: string, valor: number): ConfigurarRodadaResult {
  if (!Number.isFinite(valor) || valor < 1) return { ok: false, reason: "invalid_amount" };
  const user = processAccount(userId);
  if (user.bankLocked) return { ok: false, reason: "locked" };

  user.cassino.betPerRound = Math.floor(valor);
  saveData();
  return { ok: true, betPerRound: user.cassino.betPerRound };
}

export type GirarRoletaResult =
  | {
      ok: true;
      apostaCor: RoletaCor;
      apostaNumero: number;
      resultCor: RoletaCor;
      resultNumero: number;
      outcome: "cor" | "perde" | "jackpot" | "catastrofe";
      betAmount: number;
      bancaDelta: number; // variação líquida na banca (pode ser negativa)
      fichasPerdidas: number; // quanto foi tirado da carteira (só no cenário catastrófico)
      debtAdded: number; // dívida criada em nome do usuário (só no cenário catastrófico)
      newBanca: number;
    }
  | { ok: false; reason: "locked" | "no_bet" | "invalid_input" };

/** Gira a roleta usando o valor de aposta por rodada já definido (via configurarRodada). */
export function girarRoleta(userId: string, cor: RoletaCor, numero: number): GirarRoletaResult {
  if (cor !== "branco" && cor !== "preto") return { ok: false, reason: "invalid_input" };
  if (!Number.isInteger(numero) || numero < 1 || numero > ROLETA_NUMEROS) {
    return { ok: false, reason: "invalid_input" };
  }

  const user = processAccount(userId);
  if (user.bankLocked) return { ok: false, reason: "locked" };

  const cassino = user.cassino;
  const betAmount = cassino.betPerRound;
  if (betAmount <= 0 || cassino.banca < betAmount) {
    return { ok: false, reason: "no_bet" };
  }

  const resultCor: RoletaCor = Math.random() < 0.5 ? "branco" : "preto";
  const resultNumero = Math.floor(Math.random() * ROLETA_NUMEROS) + 1;
  const colorHit = resultCor === cor;
  const numberHit = resultNumero === numero;

  let bancaDelta = 0;
  let fichasPerdidas = 0;
  let debtAdded = 0;
  let outcome: "cor" | "perde" | "jackpot" | "catastrofe";

  if (colorHit && !numberHit) {
    bancaDelta = betAmount * 2;
    outcome = "cor";
  } else if (!colorHit && !numberHit) {
    bancaDelta = -betAmount;
    outcome = "perde";
  } else if (colorHit && numberHit) {
    bancaDelta = betAmount * 100;
    outcome = "jackpot";
  } else {
    // cor errada, número certo: perda de 100x — banca, depois carteira, depois dívida
    const totalLoss = betAmount * 100;
    outcome = "catastrofe";
    const fromBanca = Math.min(cassino.banca, totalLoss);
    bancaDelta = -fromBanca;
    let remaining = totalLoss - fromBanca;

    if (remaining > 0) {
      const fromWallet = Math.min(user.fichas, remaining);
      user.fichas -= fromWallet;
      fichasPerdidas = fromWallet;
      remaining -= fromWallet;
    }
    if (remaining > 0) {
      addForcedDebt(user, remaining);
      debtAdded = remaining;
    }
  }

  cassino.banca = Math.max(0, cassino.banca + bancaDelta);

  const resultAmount =
    outcome === "catastrofe" ? betAmount * 100 : outcome === "perde" ? betAmount : Math.abs(bancaDelta);
  cassino.lastResult = {
    cor: resultCor,
    numero: resultNumero,
    outcome,
    amount: resultAmount,
    won: outcome === "cor" || outcome === "jackpot",
  };

  saveData();

  return {
    ok: true,
    apostaCor: cor,
    apostaNumero: numero,
    resultCor,
    resultNumero,
    outcome,
    betAmount,
    bancaDelta,
    fichasPerdidas,
    debtAdded,
    newBanca: cassino.banca,
  };
}

export type SacarCassinoResult =
  | { ok: true; amount: number; banca: number }
  | { ok: false; reason: "invalid_amount" };

/** Saca um valor da banca do cassino de volta para a carteira (fichas). */
export function sacarCassino(userId: string, valor: number): SacarCassinoResult {
  const user = processAccount(userId);
  const cassino = user.cassino;
  if (!Number.isFinite(valor) || valor < 1 || valor > cassino.banca) {
    return { ok: false, reason: "invalid_amount" };
  }
  cassino.banca -= valor;
  user.fichas += valor;
  saveData();
  return { ok: true, amount: valor, banca: cassino.banca };
}

/** Sai da mesa: devolve toda a banca restante para a carteira e encerra a sessão. */
export function sairCassino(userId: string): { returned: number } {
  const user = processAccount(userId);
  const cassino = user.cassino;
  const returned = cassino.banca;
  user.fichas += returned;
  cassino.banca = 0;
  cassino.betPerRound = DEFAULT_BET_PER_ROUND;
  cassino.lastResult = null;
  saveData();
  return { returned };
}
