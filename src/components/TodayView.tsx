import { useState } from 'react';
import type { Till } from '../lib/useTill';
import { dayTotals, formatPence, totalsByCashier, type ClosedDay } from '../lib/model';
import { Card, SaleList, TotalTile } from './shared';
import { CardFeeUpdate, CashPanel } from './CashPanel';
import { DaySummary } from './HistoryView';

export default function TodayView({ till }: { till: Till }) {
  const { day, current } = till.state;
  const totals = dayTotals(day);
  const [closing, setClosing] = useState(false);
  const [justClosed, setJustClosed] = useState<ClosedDay | null>(null);

  if (justClosed) {
    return (
      <div className="h-full overflow-y-auto p-3 md:p-6">
        <div className="mx-auto max-w-3xl space-y-4">
          <Card className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950">
            <p className="font-semibold text-emerald-800 dark:text-emerald-200">
              Day saved{till.state.driveLinked ? ' - saving to Google Drive, and closing on every device' : ''}. The till is reset for a new day.
            </p>
          </Card>
          <DaySummary day={justClosed} />
          <button onClick={() => setJustClosed(null)} className="h-14 w-full rounded-xl bg-brand-600 text-lg font-bold text-white">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 md:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-bold">Today <span className="text-base font-normal text-slate-500">· cashier {till.state.deviceName}</span></h1>
          <span className="text-sm text-slate-500">
            {day.sales.length > 0
              ? `First sale ${new Date(day.sales[0].completedAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
              : 'No sales yet'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          <TotalTile label="Total takings" value={formatPence(totals.total)} tone="total" />
          <TotalTile label="Cash" value={formatPence(totals.cash)} tone="cash" />
          <TotalTile label="Card" value={formatPence(totals.card)} tone="card" note={totals.cardFees > 0 ? `fees −${formatPence(totals.cardFees)} (est.)` : undefined} />
          <TotalTile label="Cash in till" value={formatPence(totals.expectedDrawer)} />
        </div>

        <CardFeeUpdate till={till} day={day} />

        <CashPanel till={till} day={day} totals={totals} />

        {!closing ? (
          <button
            onClick={() => setClosing(true)}
            className="h-14 w-full rounded-xl bg-brand-600 text-lg font-bold text-white disabled:opacity-40"
          >
            End of day…
          </button>
        ) : (
          <Card className="space-y-3 border-brand-300">
            <h2 className="text-lg font-bold">End of day</h2>
            {till.state.driveLinked && (
              <p className="rounded-lg bg-brand-50 p-2 text-sm text-brand-900 dark:bg-brand-950 dark:text-brand-100">
                This closes the day for every cashier's device, and starts a new day on all of them.
              </p>
            )}
            {current.lines.length > 0 && (
              <p className="rounded-lg bg-amber-100 p-2 text-sm text-amber-900">
                There's an unfinished sale on the till. It will be discarded if you close now.
              </p>
            )}
            {day.countedCash === undefined ? (
              <p className="rounded-lg bg-amber-100 p-2 text-sm text-amber-900">
                The till hasn't been cashed up yet. Use <strong>Cash up…</strong> above first if you want the count on the
                day's record - you can also add it later from History.
              </p>
            ) : (
              <p className="tabular text-sm">
                Cashed up: <strong>{formatPence(day.countedCash)}</strong> counted, should be{' '}
                <strong>{formatPence(totals.expectedDrawer)}</strong>
                {day.countedCash === totals.expectedDrawer
                  ? ' - balances.'
                  : ` - ${day.countedCash > totals.expectedDrawer ? 'over' : 'short'} by ${formatPence(Math.abs(day.countedCash - totals.expectedDrawer))}.`}
              </p>
            )}
            <div className="tabular grid grid-cols-2 gap-1 text-sm md:grid-cols-4">
              <span>Sales: <strong>{totals.count}</strong></span>
              <span>Total: <strong>{formatPence(totals.total)}</strong></span>
              <span>Cash: <strong>{formatPence(totals.cash)}</strong></span>
              <span>Card: <strong>{formatPence(totals.card)}</strong></span>
            </div>
            {totals.cardFees > 0 && (
              <p className="tabular text-xs text-slate-500">
                Card fees (est.) −{formatPence(totals.cardFees)} · takings after fees {formatPence(totals.total - totals.cardFees)}
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setClosing(false)} className="h-12 flex-1 rounded-xl bg-slate-200 font-semibold dark:bg-slate-800">
                Cancel
              </button>
              <button
                onClick={() => {
                  setJustClosed(till.endDay());
                  setClosing(false);
                }}
                className="h-12 flex-[2] rounded-xl bg-brand-600 font-bold text-white"
              >
                Save day &amp; reset
              </button>
            </div>
          </Card>
        )}

        <ByCashier till={till} />

        <Card>
          <h2 className="mb-1 font-bold">Transactions</h2>
          {totals.voidedCount > 0 && <p className="text-xs text-slate-500">{totals.voidedCount} voided - not in the totals</p>}
          <SaleList sales={day.sales} onToggleVoid={till.toggleVoid} />
        </Card>
      </div>
    </div>
  );
}

/** Each cashier's share of today's sales. */
function ByCashier({ till }: { till: Till }) {
  const rows = totalsByCashier(till.state.day.sales);
  if (rows.length < 2) return null;
  return (
    <Card className="space-y-1">
      <h2 className="font-bold">By cashier</h2>
      <table className="tabular w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-1 pr-2">Cashier</th>
            <th className="py-1 pr-2 text-right">Sales</th>
            <th className="py-1 pr-2 text-right">Cash</th>
            <th className="py-1 pr-2 text-right">Card</th>
            <th className="py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-100 dark:divide-brand-950">
          {rows.map((r) => (
            <tr key={r.cashier}>
              <td className="py-1.5 pr-2 font-semibold">
                {r.cashier}
                {r.cashier === till.state.deviceName && <span className="font-normal text-slate-500"> (this device)</span>}
              </td>
              <td className="py-1.5 pr-2 text-right">{r.count}</td>
              <td className="py-1.5 pr-2 text-right">{formatPence(r.cash)}</td>
              <td className="py-1.5 pr-2 text-right">{formatPence(r.card)}</td>
              <td className="py-1.5 text-right">{formatPence(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

