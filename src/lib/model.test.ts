import { describe, expect, it } from 'vitest';
import {
  applyCard,
  applyCash,
  cardFee,
  cashSuggestions,
  closeDay,
  dayToCsv,
  dayTotals,
  keypadPress,
  linesTotal,
  parsePence,
  remaining,
  type Day,
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

  it('always offers the four notes', () => {
    expect(cashSuggestions(1350)).toEqual([500, 1000, 2000, 5000]);
    expect(cashSuggestions(0)).toEqual([]);
  });

  it('two taps of £20 on £35 owed takes £40 and gives £5 change', () => {
    const first = applyCash(3500, 2000);
    expect(first.change).toBe(0);
    const second = applyCash(3500 - first.payment.amount, 2000);
    expect(second.payment.amount).toBe(1500);
    expect(second.change).toBe(500);
  });
});

describe('card fees', () => {
  it('works out percentage plus fixed, rounded to the penny', () => {
    expect(cardFee(1000, { percent: 1.69, fixed: 0 })).toBe(17);
    expect(cardFee(1000, { percent: 1.75, fixed: 20 })).toBe(38);
    expect(cardFee(1000, undefined)).toBe(0);
  });

  it('stamps the fee on the card payment and totals it, leaving voided sales out', () => {
    const rate = { percent: 1.69, fixed: 0 };
    const d: Day = {
      id: 'x',
      openedAt: '2026-11-21T09:00:00Z',
      float: 0,
      sales: [
        { id: 'a', lines: [line(2000)], payments: [applyCard(2000, undefined, rate)], completedAt: '2026-11-21T10:00:00Z' },
        { id: 'b', lines: [line(500)], payments: [applyCash(500, 500).payment], completedAt: '2026-11-21T10:05:00Z' },
        {
          id: 'c',
          lines: [line(1000)],
          payments: [applyCard(1000, undefined, rate)],
          completedAt: '2026-11-21T10:10:00Z',
          voidedAt: '2026-11-21T10:11:00Z',
        },
      ],
    };
    expect(d.sales[0].payments[0].fee).toBe(34);
    expect(dayTotals(d).cardFees).toBe(34);
    const csv = dayToCsv(closeDay(d));
    expect(csv).toContain('Card fees (estimated),-0.34');
    expect(csv).toContain('Takings after card fees,24.66');
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
      cardFees: 0,
    });
  });

  it('writes a CSV with an over/short line when cash was counted', () => {
    const csv = dayToCsv(closeDay(day, 5950));
    expect(csv).toContain('Total takings,17.00');
    expect(csv).toContain('Over / short,-0.50');
    expect(csv).toContain(',Voided');
    expect(dayToCsv(closeDay(day, undefined, 'iPad'))).toMatch(/^Till,iPad\n/);
  });
});
