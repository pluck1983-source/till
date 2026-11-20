/**
 * Till data model and the pure maths behind it. All money is held in whole
 * pence (integers) so totals never pick up floating-point drift like
 * 0.1 + 0.2 = 0.30000000000000004.
 */

export type PaymentMethod = 'cash' | 'card';

export interface SaleLine {
  id: string;
  /** Price of one unit, in pence */
  price: number;
  qty: number;
  /** Quick-item name, or empty for a keyed-in amount */
  label: string;
}

export interface Payment {
  id: string;
  method: PaymentMethod;
  /** Amount put towards the sale, in pence (cash is net of change given) */
  amount: number;
  /** Cash handed over, in pence - only for cash, and only when change was given */
  tendered?: number;
}

export interface Sale {
  id: string;
  lines: SaleLine[];
  payments: Payment[];
  completedAt: string;
  /** Set when a sale is voided after completion; kept for the record but left out of totals */
  voidedAt?: string;
}

export interface Day {
  id: string;
  openedAt: string;
  /** Cash in the drawer at the start of the day, in pence */
  float: number;
  /** True once the float has been set (or skipped) for this day, so the till stops asking */
  floatSet?: boolean;
  sales: Sale[];
}

export interface DayTotals {
  count: number;
  voidedCount: number;
  total: number;
  cash: number;
  card: number;
  /** float + cash takings: what should be in the drawer */
  expectedDrawer: number;
}

export interface ClosedDay extends Day {
  closedAt: string;
  totals: DayTotals;
  /** Cash counted at close, if entered */
  countedCash?: number;
}

export interface QuickItem {
  id: string;
  label: string;
  price: number;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function linesTotal(lines: SaleLine[]): number {
  return lines.reduce((sum, l) => sum + l.price * l.qty, 0);
}

export function paidTotal(payments: Payment[]): number {
  return payments.reduce((sum, p) => sum + p.amount, 0);
}

export function remaining(lines: SaleLine[], payments: Payment[]): number {
  return linesTotal(lines) - paidTotal(payments);
}

/**
 * Applies cash handed over against what's still owed. Anything above what's
 * owed comes back as change; the payment records only the amount kept.
 */
export function applyCash(owed: number, tendered: number): { payment: Payment; change: number } {
  const amount = Math.min(owed, tendered);
  const change = Math.max(0, tendered - owed);
  return {
    payment: { id: newId(), method: 'cash', amount, ...(change > 0 ? { tendered } : {}) },
    change,
  };
}

/** Card takes the amount given, capped at what's owed (a card can't give change). */
export function applyCard(owed: number, amount?: number): Payment {
  const take = amount && amount > 0 ? Math.min(amount, owed) : owed;
  return { id: newId(), method: 'card', amount: take };
}

export function dayTotals(day: Pick<Day, 'sales' | 'float'>): DayTotals {
  let count = 0;
  let voidedCount = 0;
  let cash = 0;
  let card = 0;
  for (const sale of day.sales) {
    if (sale.voidedAt) {
      voidedCount++;
      continue;
    }
    count++;
    for (const p of sale.payments) {
      if (p.method === 'cash') cash += p.amount;
      else card += p.amount;
    }
  }
  return { count, voidedCount, total: cash + card, cash, card, expectedDrawer: day.float + cash };
}

/** Quick cash notes worth offering for an amount owed: the next whole pound and common notes above it. */
export function cashSuggestions(owed: number): number[] {
  if (owed <= 0) return [];
  const out = new Set<number>();
  const nextPound = Math.ceil(owed / 100) * 100;
  if (nextPound !== owed) out.add(nextPound);
  for (const note of [500, 1000, 2000, 5000]) if (note > owed) out.add(note);
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

/**
 * Parses keypad text ("12", "12.5", "0.99") into pence. Returns 0 for an
 * empty or invalid entry.
 */
export function parsePence(text: string): number {
  if (!/^\d*\.?\d{0,2}$/.test(text) || text === '' || text === '.') return 0;
  const [pounds, pence = ''] = text.split('.');
  return Number(pounds || '0') * 100 + Number(pence.padEnd(2, '0'));
}

/** Applies a keypad key to the entry text, refusing anything that wouldn't be a valid amount. */
export function keypadPress(text: string, key: string): string {
  if (key === 'back') return text.slice(0, -1);
  if (key === 'clear') return '';
  if (key === '.') return text.includes('.') ? text : (text || '0') + '.';
  const next = text === '0' ? key : text + key;
  const [pounds, pence] = next.split('.');
  if (pence !== undefined && pence.length > 2) return text;
  if (pounds.replace(/^0+/, '').length > 5) return text; // £99,999.99 max per entry
  return next;
}

export function newDay(float = 0): Day {
  return { id: newId(), openedAt: new Date().toISOString(), float, sales: [] };
}

export function closeDay(day: Day, countedCash?: number): ClosedDay {
  return {
    ...day,
    closedAt: new Date().toISOString(),
    totals: dayTotals(day),
    ...(countedCash !== undefined ? { countedCash } : {}),
  };
}

/** Local calendar date (YYYY-MM-DD) for a timestamp - used to name saved days. */
export function localDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const pounds = (p: number) => (p / 100).toFixed(2);

/** One row per sale, then a totals block - opens straight into Google Sheets or Excel. */
export function dayToCsv(day: ClosedDay): string {
  const rows: (string | number)[][] = [['Time', 'Items', 'Total', 'Cash', 'Card', 'Status']];
  for (const sale of day.sales) {
    const cash = sale.payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0);
    const card = sale.payments.filter((p) => p.method === 'card').reduce((s, p) => s + p.amount, 0);
    const items = sale.lines
      .map((l) => `${l.qty > 1 ? `${l.qty} x ` : ''}${l.label || 'Item'} ${pounds(l.price)}`)
      .join('; ');
    rows.push([
      new Date(sale.completedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      items,
      pounds(cash + card),
      pounds(cash),
      pounds(card),
      sale.voidedAt ? 'Voided' : '',
    ]);
  }
  const t = day.totals;
  rows.push([]);
  rows.push(['Sales', t.count]);
  rows.push(['Voided', t.voidedCount]);
  rows.push(['Total takings', pounds(t.total)]);
  rows.push(['Cash', pounds(t.cash)]);
  rows.push(['Card', pounds(t.card)]);
  rows.push(['Opening float', pounds(day.float)]);
  rows.push(['Cash in till (float + cash)', pounds(t.expectedDrawer)]);
  if (day.countedCash !== undefined) {
    rows.push(['Counted in drawer', pounds(day.countedCash)]);
    rows.push(['Over / short', pounds(day.countedCash - t.expectedDrawer)]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
export function formatPence(p: number): string {
  return gbp.format(p / 100);
}
