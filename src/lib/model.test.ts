import { describe, expect, it } from 'vitest';
import {
  applyCard,
  applyCash,
  cashSuggestions,
  closeDay,
  dayToCsv,
  dayTotals,
  keypadPress,
  linesTotal,
  parsePence,
  remaining,
  type Day,
  totalsForDate,
  type SaleLine,
} from './model';

const line = (price: number, qty = 1): SaleLine => ({ id: String(Math.random()), price, qty, label: '' });

describe('keypad entry', () => {
  it('parses pounds and pence', () => {
    expect(parsePence('5')).toBe(500);
    expect(parsePence('2.5')).toBe(250);
    expect(parsePence('0.99')).toBe(99);
    expect(parsePence('.')).toBe(0);
    expect(parsePence('')).toBe(0);
  });

  it('caps pence at two digits and allows one decimal point', () => {
    let t = '';
    for (const k of ['1', '.', '2', '3', '4', '.']) t = keypadPress(t, k);
    expect(t).toBe('1.23');
    expect(keypadPress('', '.')).toBe('0.');
    expect(keypadPress('0', '7')).toBe('7');
    expect(keypadPress('12', 'back')).toBe('1');
  });
});

describe('sale maths', () => {
  it('adds lines with quantities', () => {
    expect(linesTotal([line(250, 2), line(99)])).toBe(599);
  });

  it('gives change on cash and records only the amount kept', () => {
    const { payment, change } = applyCash(1350, 2000);
    expect(payment.amount).toBe(1350);
    expect(payment.tendered).toBe(2000);
    expect(change).toBe(650);
  });

  it('takes part cash then the rest on card', () => {
    const lines = [line(1000), line(500)];
    const cash = applyCash(1500, 1000).payment;
    expect(remaining(lines, [cash])).toBe(500);
    const card = applyCard(remaining(lines, [cash]));
    expect(remaining(lines, [cash, card])).toBe(0);
  });

  it('caps a card amount at what is owed', () => {
    expect(applyCard(500, 900).amount).toBe(500);
    expect(applyCard(500, 200).amount).toBe(200);
  });

  it('suggests sensible notes', () => {
    expect(cashSuggestions(1350)).toEqual([1400, 2000, 5000]);
    expect(cashSuggestions(300)).toEqual([500, 1000, 2000, 5000]);
  });
});

describe('day totals', () => {
  const day: Day = {
    id: 'd',
    openedAt: '2026-11-20T09:00:00Z',
    float: 5000,
    sales: [
      { id: 'a', lines: [line(1000)], payments: [applyCash(1000, 2000).payment], completedAt: '2026-11-20T10:00:00Z' },
      { id: 'b', lines: [line(700)], payments: [applyCard(700)], completedAt: '2026-11-20T11:00:00Z' },
      {
        id: 'c',
        lines: [line(300)],
        payments: [applyCard(300)],
        completedAt: '2026-11-20T12:00:00Z',
        voidedAt: '2026-11-20T12:01:00Z',
      },
    ],
  };

  it('splits cash and card and leaves voided sales out', () => {
    expect(dayTotals(day)).toEqual({
      count: 2,
      voidedCount: 1,
      total: 1700,
      cash: 1000,
      card: 700,
      expectedDrawer: 6000,
    });
  });

  it('adds up several tills for one date', () => {
    const closed = closeDay(day, undefined, 'iPad');
    const other: Day = { ...day, id: 'e', float: 2000, sales: [day.sales[0]] };
    const a = totalsForDate(other, [closed], '2026-11-20');
    expect(a.open).toBe(true);
    expect(a.totals.total).toBe(2700);
    expect(a.totals.cash).toBe(2000);
    expect(a.totals.expectedDrawer).toBe(6000 + 3000);
    expect(totalsForDate(other, [closed], '2026-11-21').totals.total).toBe(0);
  });

  it('writes a CSV with an over/short line when cash was counted', () => {
    const csv = dayToCsv(closeDay(day, 5950));
    expect(csv).toContain('Total takings,17.00');
    expect(csv).toContain('Over / short,-0.50');
    expect(csv).toContain(',Voided');
    expect(dayToCsv(closeDay(day, undefined, 'iPad'))).toMatch(/^Till,iPad\n/);
  });
});
