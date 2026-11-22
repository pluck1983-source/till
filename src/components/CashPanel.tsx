import { useState } from 'react';
import type { Till } from '../lib/useTill';
import {
  applyCardFeeRate,
  cardPaymentsNotAtRate,
  closingCash,
  countsTotal,
  dayTotals,
  describeCounts,
  formatPence,
  overShort,
  type Day,
  type DayTotals,
  type Sale,
} from '../lib/model';
import DenominationCounter from './DenominationCounter';
import { Card } from './shared';

/**
 * A day's float and cash-up, both editable: the open day on Today, or a
 * closed day from History (pass its dayId).
 */
export function CashPanel({ till, day, totals, dayId }: { till: Till; day: Day; totals: DayTotals; dayId?: string }) {
  const [counting, setCounting] = useState<'float' | 'cashup' | null>(null);
  const diff = overShort(day, totals);
  // The day before this one (history is newest first), for carrying its cash over as this float.
  const history = till.state.history;
  const previous = dayId ? history[history.findIndex((d) => d.id === dayId) + 1] : history[0];
  const carry = previous ? closingCash(previous) : null;
  const carryIsCurrent = carry !== null && carry.amount === day.float;

  return (
    <Card className="tabular space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Opening float</div>
          <div className="text-xl font-bold">{formatPence(day.float)}</div>
          {day.floatCounts && <div className="text-xs text-slate-500">{describeCounts(day.floatCounts)}</div>}
        </div>
        <button onClick={() => setCounting('float')} className="rounded-lg border-2 border-brand-600 px-3 py-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
          {day.float || day.floatCounts ? 'Edit float…' : 'Count float…'}
        </button>
      </div>
      {carry && carry.amount > 0 && !carryIsCurrent && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 p-2 text-sm dark:bg-brand-950">
          <span className="flex-1">
            Cash left in the till at the end of the previous day:{' '}
            <strong>{formatPence(carry.amount)}</strong> ({carry.counted ? 'cash-up count' : 'float + cash sales, not counted'}).
          </span>
          <button
            onClick={() => {
              if (confirm(`Set this day's float to ${formatPence(carry.amount)}, the cash left in the till the day before?`))
                till.setFloat(carry.amount, carry.counts, dayId);
            }}
            className="rounded-lg bg-brand-600 px-3 py-1.5 font-semibold text-white"
          >
            Use as float
          </button>
        </div>
      )}

      <div className="rounded-xl bg-emerald-50 p-3 text-sm dark:bg-emerald-950">
        <div className="flex justify-between"><span>Float</span><span>{formatPence(day.float)}</span></div>
        <div className="flex justify-between"><span>Cash sales</span><span>{formatPence(totals.cash)}</span></div>
        <div className="mt-1 flex justify-between border-t border-emerald-200 pt-1 text-lg font-bold text-emerald-800 dark:border-emerald-800 dark:text-emerald-200">
          <span>Should be in till</span>
          <span>{formatPence(totals.expectedDrawer)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Cash up</div>
          {day.countedCash === undefined ? (
            <div className="text-sm text-slate-500">Not counted yet</div>
          ) : (
            <>
              <div className="text-xl font-bold">
                {formatPence(day.countedCash)}{' '}
                <span className={`text-base ${diff === 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700'}`}>
                  {diff === 0 ? 'balances' : `${diff! > 0 ? 'over' : 'short'} ${formatPence(Math.abs(diff!))}`}
                </span>
              </div>
              {day.countedCounts && <div className="text-xs text-slate-500">{describeCounts(day.countedCounts)}</div>}
            </>
          )}
        </div>
        {day.countedCash !== undefined && (
          <button
            onClick={() => {
              if (confirm('Remove this cash-up count?')) till.setCashUp(null, dayId);
            }}
            className="px-2 text-sm text-slate-500 underline"
          >
            Clear
          </button>
        )}
        <button onClick={() => setCounting('cashup')} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white">
          {day.countedCash === undefined ? 'Cash up…' : 'Recount…'}
        </button>
      </div>

      {counting === 'float' && (
        <DenominationCounter
          title="Opening float"
          hint="How many of each note and coin were in the till at the start of the day."
          initial={day.floatCounts}
          amountEntry={{
            current: day.float,
            onSaveAmount: (amount) => {
              till.setFloat(amount, undefined, dayId);
              setCounting(null);
            },
          }}
          onCancel={() => setCounting(null)}
          onSave={(counts) => {
            till.setFloat(countsTotal(counts), counts, dayId);
            setCounting(null);
          }}
        />
      )}
      {counting === 'cashup' && (
        <DenominationCounter
          title="Cash up"
          hint="Count everything in the till - float included."
          initial={day.countedCounts}
          expected={totals.expectedDrawer}
          amountEntry={{
            current: day.countedCash ?? 0,
            totalLabel: 'Total cash in the till',
            adjust: false,
            onSaveAmount: (amount) => {
              till.setCashUp(null, dayId, amount);
              setCounting(null);
            },
          }}
          onCancel={() => setCounting(null)}
          onSave={(counts) => {
            till.setCashUp(counts, dayId);
            setCounting(null);
          }}
        />
      )}
    </Card>
  );
}

/** Offers to bring a day's card fees into line with the current rate. */
export function CardFeeUpdate({ till, day, dayId }: { till: Till; day: Day; dayId?: string }) {
  const rate = till.state.cardFeeRate ?? { percent: 0, fixed: 0 };
  const sales: Sale[] = day.sales;
  const mismatched = cardPaymentsNotAtRate(sales, rate);
  if (mismatched === 0) return null;
  const now = dayTotals(day).cardFees;
  const after = dayTotals({ ...day, sales: applyCardFeeRate(sales, rate, '') }).cardFees;
  const rateText = till.state.cardFeeRate ? `${rate.percent}%${rate.fixed ? ` + ${formatPence(rate.fixed)}` : ''}` : 'no fee';
  const when = dayId ? 'on this day' : 'today';
  return (
    <Card className="flex flex-wrap items-center gap-3 border-brand-300 text-sm">
      <span className="flex-1">
        {mismatched} card payment{mismatched === 1 ? '' : 's'} {when} {mismatched === 1 ? 'has' : 'have'} a fee that doesn't
        match the current card fee ({rateText}).
      </span>
      <button
        onClick={() => {
          if (confirm(`Recalculate the card fees on every card payment ${when} at ${rateText}?`)) till.updateCardFees(dayId);
        }}
        className="tabular rounded-lg bg-brand-600 px-3 py-2 font-semibold text-white"
      >
        Update card fees ({formatPence(now)} → {formatPence(after)})
      </button>
    </Card>
  );
}
