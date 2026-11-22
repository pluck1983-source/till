/**
 * The till's shared data: one record for the whole business (one drawer, one
 * float), which several cashier devices merge into a single Google Drive file.
 *
 * Google Drive can't do "only save if nobody else changed it", so two devices
 * saving at the same instant can each overwrite the other's latest sale. The
 * merge below is built so that never loses anything for long:
 *
 * - Sales are only ever added, keyed by their random ID. A device keeps every
 *   sale it has seen and merges again on every sync, so a sale knocked out of
 *   the file by a simultaneous save is put back on the next round.
 * - Things that change (a void, the float, quick items) carry a timestamp and
 *   the newest change wins.
 * - Closing the day is shared. A sale rung up on another device after the day
 *   was closed moves to the next day instead of vanishing into a closed one.
 *
 * Every device applies the same rules, so they all end up with the same data.
 */
import { dayTotals, newId, type CardFeeRate, type ClosedDay, type Day, type QuickItem, type Sale } from './model';

export interface DayRecord extends Day {
  /** When the float was last changed - the newest float wins */
  floatUpdatedAt?: string;
  /** When the cash-up was last changed - the newest count wins */
  countedUpdatedAt?: string;
  closedAt?: string;
  /** Cashier (device name) who closed the day */
  closedBy?: string;
}

export interface SharedData {
  app: 'till';
  version: 3;
  days: Record<string, DayRecord>;
  quickItems: QuickItem[];
  quickItemsUpdatedAt: string;
  /** Card fee rate, shared by every device; the newest change wins */
  cardFeeRate?: CardFeeRate;
  cardFeeRateUpdatedAt?: string;
}

const MAX_CLOSED_DAYS = 400;

export function emptyShared(): SharedData {
  const day = freshDay(newId(), new Date().toISOString());
  return { app: 'till', version: 3, days: { [day.id]: day }, quickItems: [], quickItemsUpdatedAt: '' };
}

function freshDay(id: string, openedAt: string): DayRecord {
  return { id, openedAt, float: 0, sales: [] };
}

/** The day that follows a closed one. Derived from its ID so every device creates the same one. */
export function nextDayId(closedDayId: string): string {
  return `after-${closedDayId}`;
}

const saleStamp = (s: Sale) => s.updatedAt ?? s.voidedAt ?? s.completedAt;

function mergeSales(a: Sale[], b: Sale[]): Sale[] {
  const byId = new Map<string, Sale>();
  for (const s of [...a, ...b]) {
    const have = byId.get(s.id);
    if (!have || saleStamp(s) > saleStamp(have)) byId.set(s.id, s);
  }
  return [...byId.values()].sort((x, y) => x.completedAt.localeCompare(y.completedAt) || x.id.localeCompare(y.id));
}

function mergeDay(a: DayRecord, b: DayRecord): DayRecord {
  const floatFrom = (a.floatUpdatedAt ?? '') >= (b.floatUpdatedAt ?? '') ? a : b;
  // The first close wins; its count goes with it.
  const closer = !a.closedAt ? b : !b.closedAt ? a : a.closedAt <= b.closedAt ? a : b;
  const merged: DayRecord = {
    id: a.id,
    openedAt: a.openedAt <= b.openedAt ? a.openedAt : b.openedAt,
    float: floatFrom.float,
    floatSet: Boolean(a.floatSet || b.floatSet),
    floatUpdatedAt: floatFrom.floatUpdatedAt,
    sales: mergeSales(a.sales, b.sales),
  };
  if (floatFrom.floatCounts) merged.floatCounts = floatFrom.floatCounts;
  if (closer.closedAt) {
    merged.closedAt = closer.closedAt;
    if (closer.closedBy) merged.closedBy = closer.closedBy;
  }
  // The newest cash-up wins; older data without a timestamp takes the count saved with the close.
  const countFrom =
    a.countedUpdatedAt || b.countedUpdatedAt
      ? (a.countedUpdatedAt ?? '') >= (b.countedUpdatedAt ?? '') ? a : b
      : closer;
  if (countFrom.countedCash !== undefined) merged.countedCash = countFrom.countedCash;
  if (countFrom.countedCounts) merged.countedCounts = countFrom.countedCounts;
  if (countFrom.countedUpdatedAt) merged.countedUpdatedAt = countFrom.countedUpdatedAt;
  return merged;
}

/** Combines two copies of the shared data. Order doesn't matter: merge(a, b) equals merge(b, a). */
export function mergeShared(a: SharedData, b: SharedData): SharedData {
  const days: Record<string, DayRecord> = { ...a.days };
  for (const [id, day] of Object.entries(b.days)) days[id] = days[id] ? mergeDay(days[id], day) : day;
  const quick =
    a.quickItemsUpdatedAt === b.quickItemsUpdatedAt
      ? JSON.stringify(a.quickItems) >= JSON.stringify(b.quickItems) ? a : b
      : a.quickItemsUpdatedAt > b.quickItemsUpdatedAt ? a : b;
  const fee = (a.cardFeeRateUpdatedAt ?? '') >= (b.cardFeeRateUpdatedAt ?? '') ? a : b;
  return normalize({
    app: 'till',
    version: 3,
    days,
    quickItems: quick.quickItems,
    quickItemsUpdatedAt: quick.quickItemsUpdatedAt,
    ...(fee.cardFeeRate ? { cardFeeRate: fee.cardFeeRate, cardFeeRateUpdatedAt: fee.cardFeeRateUpdatedAt } : {}),
  });
}

/**
 * Puts the data into its one valid shape: exactly one open day, no sales in a
 * closed day that were rung up after it closed, and history trimmed.
 */
export function normalize(data: SharedData): SharedData {
  const days: Record<string, DayRecord> = {};
  for (const [id, d] of Object.entries(data.days)) days[id] = { ...d, sales: [...d.sales] };

  // Sales rung up after their day was closed move to the following day.
  let moved = true;
  while (moved) {
    moved = false;
    for (const day of Object.values(days)) {
      if (!day.closedAt) continue;
      const late = day.sales.filter((s) => s.completedAt > day.closedAt!);
      if (late.length === 0) continue;
      day.sales = day.sales.filter((s) => s.completedAt <= day.closedAt!);
      const nextId = nextDayId(day.id);
      const next = days[nextId] ?? freshDay(nextId, day.closedAt);
      next.sales = mergeSales(next.sales, late);
      days[nextId] = next;
      moved = true;
    }
  }

  // Exactly one open day. Two devices that each started a day before they
  // first synced fold into the earliest one.
  const open = Object.values(days)
    .filter((d) => !d.closedAt)
    .sort((x, y) => x.openedAt.localeCompare(y.openedAt) || x.id.localeCompare(y.id));
  if (open.length > 1) {
    let keep = open[0];
    for (const other of open.slice(1)) {
      keep = { ...mergeDay(keep, { ...other, id: keep.id }), openedAt: keep.openedAt };
      delete days[other.id];
    }
    days[keep.id] = keep;
  } else if (open.length === 0) {
    const last = Object.values(days).sort((x, y) => (y.closedAt ?? '').localeCompare(x.closedAt ?? ''))[0];
    const day = last ? freshDay(nextDayId(last.id), last.closedAt!) : freshDay(newId(), new Date().toISOString());
    days[day.id] = day;
  }

  // Keep the most recent closed days only.
  const closed = Object.values(days)
    .filter((d) => d.closedAt)
    .sort((x, y) => y.closedAt!.localeCompare(x.closedAt!));
  for (const old of closed.slice(MAX_CLOSED_DAYS)) delete days[old.id];

  return { ...data, days };
}

export function openDay(data: SharedData): DayRecord {
  return Object.values(data.days).find((d) => !d.closedAt)!;
}

export function closedDays(data: SharedData): ClosedDay[] {
  return Object.values(data.days)
    .filter((d) => d.closedAt)
    .sort((x, y) => y.openedAt.localeCompare(x.openedAt))
    .map((d) => ({
      id: d.id,
      openedAt: d.openedAt,
      float: d.float,
      floatSet: d.floatSet,
      sales: d.sales,
      ...(d.floatCounts ? { floatCounts: d.floatCounts } : {}),
      ...(d.countedCounts ? { countedCounts: d.countedCounts } : {}),
      closedAt: d.closedAt!,
      totals: dayTotals(d),
      ...(d.countedCash !== undefined ? { countedCash: d.countedCash } : {}),
      ...(d.closedBy ? { till: d.closedBy } : {}),
    }));
}

/** Converts what an older version of the till stored on the device. */
export function fromLegacy(old: { day?: Day; history?: ClosedDay[]; quickItems?: QuickItem[] }): SharedData {
  const days: Record<string, DayRecord> = {};
  for (const h of old.history ?? []) {
    const { totals: _totals, till, ...rest } = h;
    days[h.id] = { ...rest, ...(till ? { closedBy: till } : {}) };
  }
  if (old.day) days[old.day.id] = { ...old.day };
  const data: SharedData = {
    app: 'till',
    version: 3,
    days,
    quickItems: old.quickItems ?? [],
    quickItemsUpdatedAt: old.quickItems?.length ? new Date(0).toISOString() : '',
  };
  return normalize(data);
}

/** JSON with object keys sorted, so the same data always gives the same text on every device. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Stable text of the data, for telling whether a merge changed anything. */
export function fingerprint(data: SharedData): string {
  return canonical([data.days, data.quickItems, data.quickItemsUpdatedAt, data.cardFeeRate, data.cardFeeRateUpdatedAt]);
}

