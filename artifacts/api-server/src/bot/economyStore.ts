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
export const NEGATIVE_STREAK_LIMIT = 60; // nº de variações seguidas com saldo negativo até virar dívida

export const PEER_LOAN_DUE_DAYS = 10; // prazo para o devedor pagar direto a quem emprestou antes de virar dívida oficial do banco

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
  negativeStreak: number; // nº de variações seguidas com o saldo negativo (zera quando volta a ficar >= 0)
}

// quantas variações recentes guardamos para exibir o histórico ao usuário
const INVEST_HISTORY_LENGTH = 10;

// ─── Salas de investimento ──────────────────────────────────────────────────
//
// Existem 4 "salas" de investimento independentes (1 a 4). Cada uma tem seu
// próprio mercado (a variação de cada bucket de tempo é diferente por sala,
// mas ainda determinística — todo mundo vê a mesma variação numa mesma sala)
// e seu próprio portfólio por usuário. Um usuário pode investir em quantas
// salas quiser ao mesmo tempo.
export const INVESTMENT_ROOMS = 4;
export type InvestmentRoom = 1 | 2 | 3 | 4;

function isValidRoom(room: number): room is InvestmentRoom {
  return Number.isInteger(room) && room >= 1 && room <= INVESTMENT_ROOMS;
}

function freshInvestmentPortfolio(): InvestmentPortfolio {
  return {
    active: false,
    deposited: 0,
    balance: 0,
    lastUpdate: Date.now(),
    lastChangePct: 0,
    history: [],
    negativeStreak: 0,
  };
}

/**
 * Empréstimo entre dois usuários (não é dinheiro criado pelo banco — sai da
 * carteira de quem empresta). Ver seção "Empréstimos entre usuários" abaixo.
 */
export interface PeerLoan {
  id: string;
  lenderId: string; // quem emprestou
  borrowerId: string; // quem pediu/recebeu
  amount: number; // valor emprestado (retido de quem empresta até a resposta)
  ratePct: number; // taxa (%) a mais que o devedor deve devolver ao credor
  totalOwed: number; // quanto ainda falta pagar ao credor (decresce com pagamentos)
  status: "pending" | "active" | "declined" | "paid" | "converted";
  createdAt: number;
  respondedAt?: number;
  dueAt?: number; // PEER_LOAN_DUE_DAYS após aceitar — depois disso vira dívida no banco
  convertedAt?: number;
}

// ─── Configurações do cassino (Roleta Brazino 777) ─────────────────────────────

export const ROLETA_NUMEROS = 15; // números de 1 a 15, em branco e em preto (30 posições)
export const DEFAULT_BET_PER_ROUND = 10; // valor padrão de aposta por rodada
export type RoletaCor = "branco" | "preto";

export interface CassinoLastResult {
  cor: RoletaCor; // cor sorteada na roleta
  numero: number; // número sorteado na roleta
  apostaCor: RoletaCor; // cor escolhida pelo jogador
  apostaNumero: number; // número escolhido pelo jogador
  outcome: "cor" | "perde" | "jackpot" | "catastrofe" | "vizinho" | "vizinho_perde";
  amount: number; // quanto foi ganho ou perdido nessa rodada (sempre positivo)
  won: boolean;
  fichasPerdidas?: number; // só nos cenários catastrófico/vizinho_perde: quanto saiu da carteira
  debtAdded?: number; // só nos cenários catastrófico/vizinho_perde: dívida criada em nome do usuário
}

export interface CassinoState {
  banca: number; // fichas depositadas na mesa (sobe a cada clique em "Depositar")
  betPerRound: number; // valor apostado por rodada (configurado em "Rodada")
  lastResult: CassinoLastResult | null; // resultado da última rodada, exibido no painel
  seenRules: boolean; // true após o usuário ter visto as regras pela primeira vez
}

// ─── Configurações do cassino (Aviator Brazino 777) ────────────────────────────

export const AVIATOR_BETTING_SECONDS = 20; // duração da fase de apostas
export const AVIATOR_CRASH_HOUSE_EDGE = 0.99; // constante da fórmula do crash point (edge da casa)
export const AVIATOR_GROWTH_RATE = 1.05; // taxa de crescimento do multiplicador por segundo
export const AVIATOR_CRASH_PAUSE_MS = 5000; // pausa mostrando o resultado antes de voltar pro "idle"
export const AVIATOR_HISTORY_SIZE = 20; // quantas rodadas o botão "Resultados" mostra

/** Banca e aposta padrão do Aviator — separadas da banca da Roleta (cassino.banca). */
export interface AviatorUserState {
  banca: number;
  betPerRound: number; // "Valor inicial" exibido no painel — última aposta usada
}

export interface AviatorBet {
  amount: number; // fichas apostadas, já debitadas da banca do Aviator do usuário
  cashedOutAt: number | null; // multiplicador em que sacou, ou null se ainda voando / perdeu
  won: number | null; // fichas creditadas ao sacar (null se ainda não sacou)
}

export type AviatorPhase = "idle" | "betting" | "flying" | "crashed";

export interface AviatorRoomState {
  userId: string;
  phase: AviatorPhase;
  bet: AviatorBet | null;
  phaseStartedAt: number; // timestamp ms de início da fase atual
  crashPoint: number | null; // sorteado ao entrar em "flying", nunca exposto antes do crash
  crashHistory: number[]; // últimos AVIATOR_HISTORY_SIZE crashPoints, mais recente primeiro
}

// Mapa em memória, uma sala por usuário (individual, como a roleta) — não precisa
// persistir em disco (rodadas são transitórias; se o bot reiniciar no meio de uma,
// ela simplesmente se perde).
const aviatorRooms = new Map<string, AviatorRoomState>();

export interface UserEconomy {
  fichas: number;
  pendingInvites: number; // invites não convertidos
  loans: Loan[];
  investments: InvestmentPortfolio[]; // índice 0..3 = Sala 1..4
  cassino: CassinoState;
  aviator: AviatorUserState;
  bankLocked: boolean;
  lockDebt: number; // dívida total no momento em que a conta foi fechada
  unlockPaid: number; // quanto já foi pago desde o bloqueio, rumo ao desbloqueio
  lastTransferAt: number; // timestamp ms da última transferência enviada (usado para limitar envios enquanto há dívida ativa)
  economyBlocked: boolean; // bloqueado por um admin de interagir com todo o sistema de economia (banco, pix, cassino, negócios)
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

// ─── Persistência JSON (empréstimos entre usuários) ────────────────────────────

const PEER_LOANS_FILE = dataFilePath("peer_loans.json");
let _peerLoans: Record<string, PeerLoan> = {};

function loadPeerLoans(): void {
  try {
    if (fs.existsSync(PEER_LOANS_FILE)) {
      const raw = fs.readFileSync(PEER_LOANS_FILE, "utf-8");
      _peerLoans = JSON.parse(raw) as Record<string, PeerLoan>;
    }
  } catch {
    _peerLoans = {};
  }
}

function savePeerLoans(): void {
  try {
    fs.writeFileSync(PEER_LOANS_FILE, JSON.stringify(_peerLoans, null, 2), "utf-8");
  } catch {
    // erros silenciosos de escrita
  }
}

loadPeerLoans();

// ─── Getters / inicializadores ────────────────────────────────────────────────

function freshUser(): UserEconomy {
  return {
    fichas: 0,
    pendingInvites: 0,
    loans: [],
    investments: Array.from({ length: INVESTMENT_ROOMS }, () => freshInvestmentPortfolio()),
    cassino: { banca: 0, betPerRound: DEFAULT_BET_PER_ROUND, lastResult: null, seenRules: false },
    aviator: { banca: 0, betPerRound: DEFAULT_BET_PER_ROUND },
    bankLocked: false,
    lockDebt: 0,
    unlockPaid: 0,
    lastTransferAt: 0,
    economyBlocked: false,
  };
}

/** Retorna o usuário (sem processar juros/mercado — use processAccount para isso). */
export function getUser(userId: string): UserEconomy {
  if (!_data[userId]) {
    _data[userId] = freshUser();
  }
  // Compatibilidade com dados antigos (retrocompatibilidade defensiva)
  const u = _data[userId]! as UserEconomy & { investment?: InvestmentPortfolio };
  if (!u.investments) {
    // Dados de antes das 4 salas: o investimento único vira a Sala 1.
    u.investments = [
      u.investment ?? freshInvestmentPortfolio(),
      freshInvestmentPortfolio(),
      freshInvestmentPortfolio(),
      freshInvestmentPortfolio(),
    ];
    delete u.investment;
  }
  for (let i = 0; i < INVESTMENT_ROOMS; i++) {
    if (!u.investments[i]) u.investments[i] = freshInvestmentPortfolio();
    if (!u.investments[i]!.history) u.investments[i]!.history = [];
    if (u.investments[i]!.negativeStreak === undefined) u.investments[i]!.negativeStreak = 0;
  }
  if (u.bankLocked === undefined) u.bankLocked = false;
  if (u.lockDebt === undefined) u.lockDebt = 0;
  if (u.unlockPaid === undefined) u.unlockPaid = 0;
  if (u.lastTransferAt === undefined) u.lastTransferAt = 0;
  if (u.economyBlocked === undefined) u.economyBlocked = false;
  if (!u.cassino) u.cassino = { banca: 0, betPerRound: DEFAULT_BET_PER_ROUND, lastResult: null, seenRules: false };
  if (u.cassino.lastResult === undefined) u.cassino.lastResult = null;
  if (u.cassino.seenRules === undefined) u.cassino.seenRules = false;
  if (!u.aviator) u.aviator = { banca: 0, betPerRound: DEFAULT_BET_PER_ROUND };
  return u;
}

/** Retorna o portfólio de investimento de uma sala específica (1 a 4) de um usuário. */
export function getInvestment(user: UserEconomy, room: number): InvestmentPortfolio {
  if (!isValidRoom(room)) throw new Error(`Sala de investimento inválida: ${room}`);
  return user.investments[room - 1]!;
}

/** Lista as salas (1 a 4) em que o usuário tem investimento ativo no momento. */
export function activeInvestmentRooms(user: UserEconomy): InvestmentRoom[] {
  const rooms: InvestmentRoom[] = [];
  for (let r = 1; r <= INVESTMENT_ROOMS; r++) {
    if (getInvestment(user, r).active) rooms.push(r as InvestmentRoom);
  }
  return rooms;
}

export function activeLoans(user: UserEconomy): Loan[] {
  return user.loans.filter((l) => !l.paid);
}

/**
 * Só os empréstimos que o usuário realmente pegou no banco (tela
 * Empréstimos) — exclui dívidas "forçadas" (cassino, investimento negativo,
 * empréstimo pessoal vencido), que só aparecem na Carteira. Ordenados do
 * mais antigo pro mais novo.
 */
export function bankLoans(user: UserEconomy): Loan[] {
  return activeLoans(user)
    .filter((l) => forcedDebtLabel(l.id) === null)
    .sort((a, b) => a.takenAt - b.takenAt);
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

  // Empréstimos entre usuários: se passou do prazo sem ser pago, vira dívida oficial
  processPeerLoansForUser(user, userId);

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
  if (bankLoans(user).length >= MAX_ACTIVE_LOANS) {
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

export type PayLoanByIndexResult =
  | { ok: true; paid: number; remaining: number; finished: boolean; unlocked: boolean }
  | { ok: false; reason: "not_found" | "insufficient" | "invalid_amount" };

/**
 * Paga um empréstimo específico. `index` é 1-based, seguindo a mesma ordem
 * (mais antigo primeiro) usada para numerar os empréstimos na tela de
 * origem — ex: empréstimo "1" ou "2".
 *
 * `scope` decide em qual lista o índice é procurado:
 *  - "bank": só empréstimos reais do banco (tela Empréstimos).
 *  - "all": qualquer dívida ativa, incluindo cassino/investimento/pessoal
 *    convertido (tela Carteira).
 */
export function payLoanByIndex(
  userId: string,
  index: number,
  amount: number,
  scope: "bank" | "all" = "all"
): PayLoanByIndexResult {
  const user = processAccount(userId);
  if (!Number.isFinite(amount) || amount < 1) return { ok: false, reason: "invalid_amount" };

  const loans = scope === "bank" ? bankLoans(user) : activeLoans(user).sort((a, b) => a.takenAt - b.takenAt);
  const loan = loans[index - 1];
  if (!loan) return { ok: false, reason: "not_found" };
  if (user.fichas < amount) return { ok: false, reason: "insufficient" };

  const payment = Math.min(amount, loan.total);
  loan.total -= payment;
  user.fichas -= payment;

  let finished = false;
  if (loan.total <= 0) {
    loan.total = 0;
    loan.paid = true;
    finished = true;
  }

  let unlocked = false;
  if (user.bankLocked) {
    user.unlockPaid += payment;
    if (user.unlockPaid >= user.lockDebt * UNLOCK_THRESHOLD) {
      user.bankLocked = false;
      user.lockDebt = 0;
      user.unlockPaid = 0;
      unlocked = true;
    }
  }

  saveData();
  return { ok: true, paid: payment, remaining: loan.total, finished, unlocked };
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

// "Sal" por sala, pra decorrelacionar completamente a sequência de cada
// mercado — sem isso, salas diferentes só deslocariam o mesmo padrão.
const ROOM_SALT = [0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f];

function roomSeed(bucket: number, room: number): number {
  const salt = ROOM_SALT[(room - 1) % ROOM_SALT.length]!;
  return (bucket ^ Math.imul(salt, room)) >>> 0;
}

/** Variação do mercado de uma sala para um "bucket" de tempo específico — igual para todos os usuários da mesma sala. */
function marketPctForBucket(bucket: number, room: number = 1): number {
  const seed = roomSeed(bucket, room);
  const r1 = seededRandom(seed);
  // Proporções pedidas eram 35 / 35 / 25 / 15 (somam 110) — normalizadas para somar 100%:
  // ~31.82% / ~31.82% / ~22.73% / ~13.64%
  if (r1 < 0.318182) return 0.1; // subiu 10%
  if (r1 < 0.636364) return -0.1; // caiu 10%

  const r2 = seededRandom(seed ^ 0x5bd1e995); // magnitude, decorrelacionada
  const r3 = seededRandom(seed ^ 0x27d4eb2f); // sinal, decorrelacionada
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

/** Retorna as últimas `count` variações do mercado de uma sala (a mesma pra todo mundo naquela sala), da mais antiga pra mais recente. */
export function getMarketHistory(count: number = 30, room: number = 1): number[] {
  const now = Date.now();
  const currentBucket = Math.floor(now / INVEST_TICK_MS);
  const history: number[] = [];
  for (let i = count - 1; i >= 0; i--) {
    history.push(marketPctForBucket(currentBucket - i, room));
  }
  return history;
}

/** Timestamp (ms) do próximo "tick" de mercado a partir de agora. */
export function nextMarketTick(): number {
  return (Math.floor(Date.now() / INVEST_TICK_MS) + 1) * INVEST_TICK_MS;
}

/** Simula as variações de mercado de uma sala que aconteceram desde a última atualização. */
function updateInvestmentRoom(user: UserEconomy, room: number): void {
  const inv = getInvestment(user, room);
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
    lastPct = marketPctForBucket(b, room);
    const delta = Math.round(inv.deposited * lastPct);
    inv.balance += delta;
    inv.history.push(lastPct);

    if (inv.balance < 0) {
      inv.negativeStreak += 1;
      if (inv.negativeStreak >= NEGATIVE_STREAK_LIMIT) {
        // Saldo ficou negativo por variações demais seguidas: a dívida é
        // cobrada na hora (entra no sistema de empréstimos), mas o
        // investimento continua ativo normalmente a partir de 0.
        addForcedDebt(user, -inv.balance, "investimento", room);
        inv.balance = 0;
        inv.negativeStreak = 0;
      }
    } else {
      inv.negativeStreak = 0;
    }
  }
  if (inv.history.length > INVEST_HISTORY_LENGTH) {
    inv.history = inv.history.slice(inv.history.length - INVEST_HISTORY_LENGTH);
  }
  inv.lastChangePct = lastPct;
  inv.lastUpdate = (lastBucket + ticks) * INVEST_TICK_MS;
}

/** Simula as variações de mercado de todas as 4 salas. */
function updateInvestment(user: UserEconomy): void {
  for (let room = 1; room <= INVESTMENT_ROOMS; room++) {
    updateInvestmentRoom(user, room);
  }
}

export type InvestResult =
  | { ok: true; portfolio: InvestmentPortfolio }
  | { ok: false; reason: "locked" | "insufficient" };

/** Investe (ou adiciona a um investimento já ativo) numa sala específica (1 a 4). */
export function investFichas(userId: string, room: number, amount: number): InvestResult {
  const user = processAccount(userId);
  if (!Number.isFinite(amount) || amount < 1) return { ok: false, reason: "insufficient" };
  if (!isValidRoom(room)) return { ok: false, reason: "insufficient" };
  if (user.bankLocked) return { ok: false, reason: "locked" };
  if (user.fichas < amount) return { ok: false, reason: "insufficient" };

  const inv = getInvestment(user, room);
  user.fichas -= amount;
  if (!inv.active) {
    inv.active = true;
    inv.deposited = amount;
    inv.balance = amount;
    inv.lastUpdate = Date.now();
    inv.lastChangePct = 0;
    inv.history = [];
    inv.negativeStreak = 0;
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

/** Saca todo o valor investido de uma sala (pode ser negativo — o usuário fica devendo). */
export function withdrawInvestment(userId: string, room: number): WithdrawResult {
  const user = processAccount(userId);
  if (!isValidRoom(room)) return { ok: false, reason: "not_active" };
  const inv = getInvestment(user, room);
  if (!inv.active) return { ok: false, reason: "not_active" };

  const amount = inv.balance;
  user.fichas += amount;
  inv.active = false;
  inv.deposited = 0;
  inv.balance = 0;
  inv.lastChangePct = 0;
  inv.history = [];
  inv.negativeStreak = 0;
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
export function withdrawPartial(userId: string, room: number, amount: number): WithdrawPartialResult {
  const user = processAccount(userId);
  if (!isValidRoom(room)) return { ok: false, reason: "not_active" };
  const inv = getInvestment(user, room);
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
    inv.negativeStreak = 0;
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

// ─── Empréstimos entre usuários (via /pix) ─────────────────────────────────────
//
// Diferente do empréstimo do banco (`takeLoan`), aqui o dinheiro sai da
// carteira de quem empresta, não é criado do nada. O valor fica retido até
// quem recebe aceitar ou recusar pelo DM. Se aceitar, ele pode pagar quando
// quiser diretamente para quem emprestou; se passar de PEER_LOAN_DUE_DAYS
// dias sem ter sido totalmente pago, o restante vira uma dívida oficial no
// banco (soma no sistema de empréstimos normal, com bloqueio de conta etc).

/**
 * Converte automaticamente em dívida "oficial" do banco qualquer empréstimo
 * pessoal ativo do usuário (como devedor) que passou do prazo sem ser
 * totalmente pago. Chamado dentro de processAccount.
 */
function processPeerLoansForUser(user: UserEconomy, userId: string): void {
  const now = Date.now();
  let changed = false;
  for (const loan of Object.values(_peerLoans)) {
    if (loan.borrowerId !== userId) continue;
    if (loan.status !== "active") continue;
    if (!loan.dueAt || now < loan.dueAt) continue;

    addForcedDebt(user, loan.totalOwed, "pessoal");
    loan.status = "converted";
    loan.convertedAt = now;
    changed = true;
  }
  if (changed) savePeerLoans();
}

export function getPeerLoan(id: string): PeerLoan | null {
  return _peerLoans[id] ?? null;
}

/** Empréstimos pessoais que o usuário pegou de outros membros (não confundir com `loans`, do banco). */
export function peerLoansAsBorrower(userId: string): PeerLoan[] {
  return Object.values(_peerLoans).filter((l) => l.borrowerId === userId);
}

/** Empréstimos pessoais que o usuário concedeu a outros membros. */
export function peerLoansAsLender(userId: string): PeerLoan[] {
  return Object.values(_peerLoans).filter((l) => l.lenderId === userId);
}

/**
 * Empréstimos pessoais ativos que o usuário pegou (como devedor), ordenados
 * do mais antigo para o mais novo — essa ordem é a usada para numerar os
 * empréstimos ("1", "2", ...) tanto na exibição da Carteira quanto no
 * formulário de pagamento.
 */
export function activePeerLoansAsBorrower(userId: string): PeerLoan[] {
  return peerLoansAsBorrower(userId)
    .filter((l) => l.status === "active")
    .sort((a, b) => a.createdAt - b.createdAt);
}

export type CreatePeerLoanResult =
  | { ok: true; loan: PeerLoan }
  | {
      ok: false;
      reason: "locked" | "insufficient" | "invalid_amount" | "invalid_rate" | "same_user";
    };

/**
 * Cria um pedido de empréstimo pessoal (comando /pix com "emprestimo: sim").
 * O valor sai imediatamente da carteira de quem empresta e fica retido até
 * o destinatário responder pela DM (ver respondPeerLoan).
 */
export function createPeerLoan(
  lenderId: string,
  borrowerId: string,
  amount: number,
  ratePct: number
): CreatePeerLoanResult {
  if (lenderId === borrowerId) return { ok: false, reason: "same_user" };
  if (!Number.isFinite(amount) || amount < 1) return { ok: false, reason: "invalid_amount" };
  if (!Number.isFinite(ratePct) || ratePct < 0) return { ok: false, reason: "invalid_rate" };

  const lender = processAccount(lenderId);
  if (lender.bankLocked) return { ok: false, reason: "locked" };
  if (lender.fichas < amount) return { ok: false, reason: "insufficient" };

  lender.fichas -= amount;
  saveData();

  const now = Date.now();
  const loan: PeerLoan = {
    id: `peer-${now}-${Math.floor(Math.random() * 10000)}`,
    lenderId,
    borrowerId,
    amount,
    ratePct,
    totalOwed: Math.ceil(amount * (1 + ratePct / 100)),
    status: "pending",
    createdAt: now,
  };
  _peerLoans[loan.id] = loan;
  savePeerLoans();
  return { ok: true, loan };
}

export type RespondPeerLoanResult =
  | { ok: true; loan: PeerLoan }
  | { ok: false; reason: "not_found" | "not_yours" | "already_answered" };

/** O destinatário aceita ou recusa (pelos botões no DM) um pedido de empréstimo pessoal. */
export function respondPeerLoan(loanId: string, responderId: string, accept: boolean): RespondPeerLoanResult {
  const loan = _peerLoans[loanId];
  if (!loan) return { ok: false, reason: "not_found" };
  if (loan.borrowerId !== responderId) return { ok: false, reason: "not_yours" };
  if (loan.status !== "pending") return { ok: false, reason: "already_answered" };

  const now = Date.now();
  if (accept) {
    const borrower = processAccount(loan.borrowerId);
    borrower.fichas += loan.amount;
    saveData();
    loan.status = "active";
    loan.respondedAt = now;
    loan.dueAt = now + PEER_LOAN_DUE_DAYS * DAY_MS;
  } else {
    const lender = processAccount(loan.lenderId);
    lender.fichas += loan.amount; // devolve o valor retido
    saveData();
    loan.status = "declined";
    loan.respondedAt = now;
  }
  savePeerLoans();
  return { ok: true, loan };
}

export type PayPeerLoanResult =
  | { ok: true; paid: number; remaining: number; finished: boolean }
  | { ok: false; reason: "not_found" | "not_yours" | "not_active" | "insufficient" | "invalid_amount" };

/** O devedor paga (parcial ou totalmente) um empréstimo pessoal ativo, direto para quem emprestou. */
export function payPeerLoan(loanId: string, payerId: string, amount: number): PayPeerLoanResult {
  const loan = _peerLoans[loanId];
  if (!loan) return { ok: false, reason: "not_found" };
  if (loan.borrowerId !== payerId) return { ok: false, reason: "not_yours" };
  if (loan.status !== "active") return { ok: false, reason: "not_active" };
  if (!Number.isFinite(amount) || amount < 1) return { ok: false, reason: "invalid_amount" };

  const borrower = processAccount(payerId);
  if (borrower.fichas < amount) return { ok: false, reason: "insufficient" };

  const payment = Math.min(amount, loan.totalOwed);
  borrower.fichas -= payment;
  const lender = processAccount(loan.lenderId);
  lender.fichas += payment;
  loan.totalOwed -= payment;

  let finished = false;
  if (loan.totalOwed <= 0) {
    loan.totalOwed = 0;
    loan.status = "paid";
    finished = true;
  }
  saveData();
  savePeerLoans();
  return { ok: true, paid: payment, remaining: loan.totalOwed, finished };
}

/**
 * Paga um empréstimo pessoal ativo (como devedor) usando o número exibido na
 * Carteira (`index`, 1-based) em vez do id interno — usado pelo formulário
 * "Pagar quem?" da Carteira.
 */
export function payPeerLoanByIndex(userId: string, index: number, amount: number): PayPeerLoanResult {
  const loans = activePeerLoansAsBorrower(userId);
  const loan = loans[index - 1];
  if (!loan) return { ok: false, reason: "not_found" };
  return payPeerLoan(loan.id, userId, amount);
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

// ─── Bloqueio de economia (admin) ──────────────────────────────────────────────
//
// Diferente de `bankLocked` (que é automático, por dívida não paga), este
// bloqueio é manual — um admin impede um usuário específico de interagir com
// todo o sistema de economia (banco, pix, cassino, negócios). O usuário
// bloqueado não consegue nem abrir essas telas nem clicar em nenhum botão
// delas; nada mais no bot é afetado.

/** Bloqueia ou desbloqueia um usuário do sistema de economia. Retorna o novo estado. */
export function setEconomyBlock(userId: string, blocked: boolean): boolean {
  const user = getUser(userId);
  user.economyBlocked = blocked;
  saveData();
  return user.economyBlocked;
}

/** Verifica se um usuário está bloqueado do sistema de economia. */
export function isEconomyBlocked(userId: string): boolean {
  return getUser(userId).economyBlocked;
}

// ─── Cassino Brazino 777 — Roleta ───────────────────────────────────────────────
//
// A roleta tem 30 posições: números de 1 a 15, cada um em branco ou em preto.
// O jogador escolhe uma cor e um número da sorte antes de girar. Resultado:
//   • Cor certa, número errado (não vizinho)  → ganha o dobro do valor apostado na rodada.
//   • Cor certa, número vizinho (±1 do escolhido) → ganha 10x o valor apostado na rodada.
//   • Cor errada, número errado (não vizinho) → perde o valor apostado na rodada.
//   • Cor errada, número vizinho (±1 do escolhido) → perde 10x o valor apostado na
//     rodada. Isso é descontado primeiro da banca, depois do saldo (fichas) e, se
//     ainda faltar, vira uma dívida em nome do usuário (entra no sistema de empréstimos).
//   • Cor certa, número certo   → ganha 100x o valor apostado na rodada.
//   • Cor errada, número certo  → perde 100x o valor apostado na rodada. Isso é
//     descontado primeiro da banca, depois do saldo (fichas) e, se ainda faltar,
//     vira uma dívida em nome do usuário (entra no sistema de empréstimos).

/** De onde veio uma dívida "forçada" (sem juros na criação) — usado só pra rotular/identificar na Carteira e em Empréstimos. */
export type ForcedDebtSource = "cassino" | "investimento" | "pessoal";

/** Adiciona uma dívida "forçada" ao nome do usuário — ex: perda no cassino, saldo negativo no investimento, ou empréstimo pessoal vencido. */
function addForcedDebt(user: UserEconomy, amount: number, source: ForcedDebtSource, room?: number): void {
  if (amount <= 0) return;
  const now = Date.now();
  const dueAt = now + LOAN_DUE_DAYS * DAY_MS;
  const roomTag = source === "investimento" && room ? `r${room}-` : "";
  user.loans.push({
    id: `${source}-${roomTag}${now}-${Math.floor(Math.random() * 1000)}`,
    amount,
    total: amount,
    takenAt: now,
    dueAt,
    lastAccrualAt: dueAt,
    paid: false,
  });
}

/** Verifica se dois números da roleta são "vizinhos" (diferença de 1, com o wraparound entre o maior e o 1). */
function isNumeroVizinho(a: number, b: number, max: number): boolean {
  const diff = Math.abs(a - b);
  return diff === 1 || diff === max - 1;
}

/** Rótulo amigável pra exibir ao lado de uma dívida forçada, a partir do prefixo do seu id (ver addForcedDebt). */
export function forcedDebtLabel(loanId: string): string | null {
  if (loanId.startsWith("cassino-")) return "cassino";
  const roomMatch = loanId.match(/^investimento-r(\d)-/);
  if (roomMatch) return `Investimento do banco (Sala ${roomMatch[1]})`;
  if (loanId.startsWith("investimento-")) return "Investimento do banco";
  if (loanId.startsWith("pessoal-")) return "empréstimo pessoal vencido";
  return null;
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
      outcome: "cor" | "perde" | "jackpot" | "catastrofe" | "vizinho" | "vizinho_perde";
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
  const vizinhoHit = !numberHit && isNumeroVizinho(resultNumero, numero, ROLETA_NUMEROS);

  let bancaDelta = 0;
  let fichasPerdidas = 0;
  let debtAdded = 0;
  let outcome: "cor" | "perde" | "jackpot" | "catastrofe" | "vizinho" | "vizinho_perde";

  if (colorHit && numberHit) {
    bancaDelta = betAmount * 100;
    outcome = "jackpot";
  } else if (colorHit && vizinhoHit) {
    bancaDelta = betAmount * 10;
    outcome = "vizinho";
  } else if (colorHit) {
    bancaDelta = betAmount * 2;
    outcome = "cor";
  } else if (numberHit) {
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
      addForcedDebt(user, remaining, "cassino");
      debtAdded = remaining;
    }
  } else if (vizinhoHit) {
    // cor errada, número vizinho: perda de 10x — banca, depois carteira, depois dívida
    const totalLoss = betAmount * 10;
    outcome = "vizinho_perde";
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
      addForcedDebt(user, remaining, "cassino");
      debtAdded = remaining;
    }
  } else {
    bancaDelta = -betAmount;
    outcome = "perde";
  }

  cassino.banca = Math.max(0, cassino.banca + bancaDelta);

  const resultAmount =
    outcome === "catastrofe"
      ? betAmount * 100
      : outcome === "vizinho_perde"
        ? betAmount * 10
        : outcome === "perde"
          ? betAmount
          : Math.abs(bancaDelta);
  cassino.lastResult = {
    cor: resultCor,
    numero: resultNumero,
    apostaCor: cor,
    apostaNumero: numero,
    outcome,
    amount: resultAmount,
    won: outcome === "cor" || outcome === "jackpot" || outcome === "vizinho",
    ...(outcome === "catastrofe" || outcome === "vizinho_perde" ? { fichasPerdidas, debtAdded } : {}),
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

/** Marca que o usuário já viu as regras da roleta (exibidas apenas na primeira vez). */
export function markRulesSeen(userId: string): void {
  const user = getUser(userId);
  if (!user.cassino.seenRules) {
    user.cassino.seenRules = true;
    saveData();
  }
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

// ─── Aviator (Brazino 777) ──────────────────────────────────────────────────────

function freshAviatorRoom(userId: string): AviatorRoomState {
  return {
    userId,
    phase: "idle",
    bet: null,
    phaseStartedAt: Date.now(),
    crashPoint: null,
    crashHistory: [],
  };
}

/** Retorna (criando se preciso) a sala individual do Aviator daquele usuário. */
export function getAviatorRoom(userId: string): AviatorRoomState {
  let room = aviatorRooms.get(userId);
  if (!room) {
    room = freshAviatorRoom(userId);
    aviatorRooms.set(userId, room);
  }
  return room;
}

export type SacarBancaAviatorResult =
  | { ok: true; amount: number; banca: number }
  | { ok: false; reason: "invalid_amount" };

/** Saca um valor da banca do Aviator de volta para a carteira (fichas). */
export function sacarBancaAviator(userId: string, valor: number): SacarBancaAviatorResult {
  const user = processAccount(userId);
  if (!Number.isFinite(valor) || valor < 1 || valor > user.aviator.banca) {
    return { ok: false, reason: "invalid_amount" };
  }
  user.aviator.banca -= valor;
  user.fichas += valor;
  saveData();
  return { ok: true, amount: valor, banca: user.aviator.banca };
}

export type DepositarAviatorResult =
  | { ok: true; added: number; banca: number }
  | { ok: false; reason: "locked" | "insufficient" | "invalid_amount" };

/** Move fichas da carteira para a banca do Aviator (banca separada da banca da Roleta). */
export function depositarAviator(userId: string, valor: number): DepositarAviatorResult {
  if (!Number.isFinite(valor) || valor < 1) return { ok: false, reason: "invalid_amount" };
  const user = processAccount(userId);
  if (user.bankLocked) return { ok: false, reason: "locked" };
  if (user.fichas < valor) return { ok: false, reason: "insufficient" };

  user.fichas -= valor;
  user.aviator.banca += valor;
  saveData();
  return { ok: true, added: valor, banca: user.aviator.banca };
}

export type ApostarAviatorResult =
  | { ok: true; betPerRound: number }
  | { ok: false; reason: "locked" | "already_bet" | "insufficient" | "wrong_phase" | "invalid_amount" };

/**
 * Aposta na rodada individual do usuário — debita da banca do Aviator dele. Se a
 * sala estiver "idle", essa aposta dá início à contagem regressiva de apostas.
 */
export function apostarAviator(userId: string, amount: number): ApostarAviatorResult {
  if (!Number.isFinite(amount) || amount < 1) return { ok: false, reason: "invalid_amount" };

  const room = getAviatorRoom(userId);
  if (room.phase !== "idle" && room.phase !== "betting") return { ok: false, reason: "wrong_phase" };
  if (room.bet) return { ok: false, reason: "already_bet" };

  const user = processAccount(userId);
  if (user.bankLocked) return { ok: false, reason: "locked" };
  if (amount > user.aviator.banca) return { ok: false, reason: "insufficient" };

  user.aviator.banca -= amount;
  user.aviator.betPerRound = Math.floor(amount);
  room.bet = { amount: Math.floor(amount), cashedOutAt: null, won: null };

  if (room.phase === "idle") {
    room.phase = "betting";
    room.phaseStartedAt = Date.now();
  }

  saveData();
  return { ok: true, betPerRound: user.aviator.betPerRound };
}

/** Sorteia o crashPoint da rodada e move a sala do usuário para a fase "flying". */
export function iniciarVooAviator(userId: string): void {
  const room = getAviatorRoom(userId);
  const r = Math.random();
  room.crashPoint = Math.max(1, AVIATOR_CRASH_HOUSE_EDGE / (1 - r));
  room.phase = "flying";
  room.phaseStartedAt = Date.now();
}

/** Multiplicador atual da sala do usuário, calculado a partir do tempo real decorrido de voo. */
export function multiplicadorAtualAviator(userId: string): number {
  const room = getAviatorRoom(userId);
  if (room.phase !== "flying") return 1;
  const elapsedSec = (Date.now() - room.phaseStartedAt) / 1000;
  return Math.pow(AVIATOR_GROWTH_RATE, elapsedSec);
}

export type SacarAviatorResult =
  | { ok: true; multiplier: number; won: number }
  | { ok: false; reason: "no_bet" | "already_cashed" | "not_flying" };

/** Saca a aposta do usuário na rodada em voo, creditando aposta × multiplicador na banca. */
export function sacarAviator(userId: string): SacarAviatorResult {
  const room = getAviatorRoom(userId);
  if (room.phase !== "flying") return { ok: false, reason: "not_flying" };

  const bet = room.bet;
  if (!bet) return { ok: false, reason: "no_bet" };
  if (bet.cashedOutAt !== null) return { ok: false, reason: "already_cashed" };

  const m = multiplicadorAtualAviator(userId);
  if (room.crashPoint !== null && m >= room.crashPoint) return { ok: false, reason: "not_flying" };

  const won = Math.round(bet.amount * m);
  bet.cashedOutAt = m;
  bet.won = won;

  const user = getUser(userId);
  user.aviator.banca += won;
  saveData();

  return { ok: true, multiplier: m, won };
}

/** Fecha a rodada: registra o crash no histórico e move a sala do usuário para "crashed". */
export function crasharAviator(userId: string): { crashPoint: number; bet: AviatorBet | null } {
  const room = getAviatorRoom(userId);
  const crashPoint = room.crashPoint ?? 1;
  room.phase = "crashed";
  room.crashHistory.unshift(crashPoint);
  if (room.crashHistory.length > AVIATOR_HISTORY_SIZE) {
    room.crashHistory.length = AVIATOR_HISTORY_SIZE;
  }
  return { crashPoint, bet: room.bet };
}

/** Reseta a sala do usuário para "idle", pronta pra próxima rodada começar assim que ele apostar. */
export function reiniciarRodadaAviator(userId: string): void {
  const room = getAviatorRoom(userId);
  room.phase = "idle";
  room.bet = null;
  room.crashPoint = null;
  room.phaseStartedAt = Date.now();
}
