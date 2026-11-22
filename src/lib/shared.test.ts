import { describe, expect, it } from 'vitest';
import { closedDays, fingerprint, fromLegacy, mergeShared, nextDayId, normalize, openDay, type SharedData } from './shared';
import type { Sale } from './model';

const sale = (id: string, at: string, amount = 100, extra: Partial<Sale> = {}): Sale => ({
  id,
  lines: [{ id: `l${id}`, price: amount, qty: 1, label: '' }],
  payments: [{ id: `p${id}`, method: 'cash', amount }],
  completedAt: at,
  ...extra,
});

const base = (sales: Sale[], extra = {}): SharedData => ({
  app: 'till',
  version: 3,
  days: { d1: { id: 'd1', openedAt: '2026-11-21T08:00:00Z', float: 0, sales, ...extra } },
  quickItems: [],
  quickItemsUpdatedAt: '',
});

describe('merging two cashiers', () => {
  it('keeps every sale from both devices, once', () => {
    const a = base([sale('a1', '2026-11-21T09:00:00Z'), sale('x', '2026-11-21T09:30:00Z')]);
    const b = base([sale('b1', '2026-11-21T09:05:00Z'), sale('x', '2026-11-21T09:30:00Z')]);
    const m = mergeShared(a, b);
    expect(openDay(m).sales.map((s) => s.id)).toEqual(['a1', 'b1', 'x']);
    expect(fingerprint(m)).toBe(fingerprint(mergeShared(b, a)));
  });

  it('takes the newest void/restore and the newest float', () => {
    const a = base([sale('s', '2026-11-21T09:00:00Z', 100, { voidedAt: '2026-11-21T10:00:00Z', updatedAt: '2026-11-21T10:00:00Z' })], {
      float: 5000,
      floatSet: true,
      floatUpdatedAt: '2026-11-21T08:01:00Z',
    });
    const b = base([sale('s', '2026-11-21T09:00:00Z')], { float: 6000, floatSet: true, floatUpdatedAt: '2026-11-21T08:02:00Z' });
    const day = openDay(mergeShared(a, b));
    expect(day.sales[0].voidedAt).toBeDefined();
    expect(day.float).toBe(6000);
  });

  it('closes the day everywhere and moves a late sale to the next day', () => {
    const closed = base([sale('a1', '2026-11-21T09:00:00Z')], { closedAt: '2026-11-21T17:00:00Z', countedCash: 100, closedBy: 'iPad' });
    const other = base([sale('a1', '2026-11-21T09:00:00Z'), sale('late', '2026-11-21T17:02:00Z', 250)]);
    const m = mergeShared(normalize(closed), other);
    const [day] = closedDays(m);
    expect(day.sales.map((s) => s.id)).toEqual(['a1']);
    expect(day.countedCash).toBe(100);
    const open = openDay(m);
    expect(open.id).toBe(nextDayId('d1'));
    expect(open.sales.map((s) => s.id)).toEqual(['late']);
  });

  it('folds two days started separately before first sync into one', () => {
    const a: SharedData = { ...base([sale('a', '2026-11-21T09:00:00Z')]) };
    const b: SharedData = {
      ...base([]),
      days: { d2: { id: 'd2', openedAt: '2026-11-21T08:30:00Z', float: 2000, floatSet: true, floatUpdatedAt: '2026-11-21T08:31:00Z', sales: [sale('b', '2026-11-21T09:10:00Z')] } },
    };
    const m = mergeShared(a, b);
    expect(Object.keys(m.days)).toEqual(['d1']);
    expect(openDay(m).sales.map((s) => s.id)).toEqual(['a', 'b']);
    expect(openDay(m).float).toBe(2000);
  });

  it('heals a lost write: re-merging the loser puts its sale back', () => {
    const file0 = base([]);
    const a = mergeShared(file0, base([sale('a', '2026-11-21T09:00:00Z')]));
    const b = mergeShared(file0, base([sale('b', '2026-11-21T09:00:01Z')]));
    // Both saved at once; B's save landed last, so the file lost A's sale.
    const file1 = b;
    const healed = mergeShared(file1, a); // A's next sync
    expect(openDay(healed).sales.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('shares the newest card fee rate', () => {
    const a = { ...base([]), cardFeeRate: { percent: 1.69, fixed: 0 }, cardFeeRateUpdatedAt: '2026-11-21T09:00:00Z' };
    const b = { ...base([]), cardFeeRate: { percent: 1.75, fixed: 10 }, cardFeeRateUpdatedAt: '2026-11-21T10:00:00Z' };
    expect(mergeShared(a, b).cardFeeRate).toEqual({ percent: 1.75, fixed: 10 });
    expect(mergeShared(b, a).cardFeeRate).toEqual({ percent: 1.75, fixed: 10 });
  });

  it('keeps the newest cash-up, even after the day closed', () => {
    const closed = base([], { closedAt: '2026-11-21T17:00:00Z', countedCash: 5000, closedBy: 'iPad' });
    const recount = base([], {
      closedAt: '2026-11-21T17:00:00Z',
      countedCash: 5250,
      countedCounts: { 2000: 2, 1000: 1, 50: 5 },
      countedUpdatedAt: '2026-11-22T09:00:00Z',
    });
    const m = mergeShared(closed, recount);
    expect(m.days.d1.countedCash).toBe(5250);
    expect(m.days.d1.countedCounts).toEqual({ 2000: 2, 1000: 1, 50: 5 });
    expect(mergeShared(recount, closed).days.d1.countedCash).toBe(5250);
  });

  it('a cleared cash-up stays cleared', () => {
    const counted = base([], { countedCash: 5000, countedUpdatedAt: '2026-11-21T17:00:00Z' });
    const cleared = base([], { countedUpdatedAt: '2026-11-21T18:00:00Z' });
    expect(mergeShared(counted, cleared).days.d1.countedCash).toBeUndefined();
  });

  it('carries the float breakdown with the newest float', () => {
    const a = base([], { float: 5000, floatCounts: { 2000: 2, 1000: 1 }, floatSet: true, floatUpdatedAt: '2026-11-21T08:00:00Z' });
    const b = base([], { float: 3000, floatCounts: { 1000: 3 }, floatSet: true, floatUpdatedAt: '2026-11-21T08:05:00Z' });
    expect(mergeShared(a, b).days.d1.floatCounts).toEqual({ 1000: 3 });
  });

  it('converts the old on-device format', () => {
    const data = fromLegacy({
      day: { id: 'now', openedAt: '2026-11-21T08:00:00Z', float: 0, sales: [] },
      history: [
        {
          id: 'old',
          openedAt: '2026-11-20T08:00:00Z',
          float: 5000,
          sales: [sale('o', '2026-11-20T09:00:00Z')],
          closedAt: '2026-11-20T17:00:00Z',
          totals: { count: 1, voidedCount: 0, total: 100, cash: 100, card: 0, expectedDrawer: 5100, cardFees: 0 },
          till: 'iPad',
        },
      ],
    });
    expect(openDay(data).id).toBe('now');
    expect(closedDays(data)[0].totals.expectedDrawer).toBe(5100);
  });
});
