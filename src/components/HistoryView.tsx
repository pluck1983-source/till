import { useState } from 'react';
import type { Till } from '../lib/useTill';
import { dayToCsv, formatPence, localDate, type ClosedDay } from '../lib/model';
import { Card, SaleList, TotalTile } from './shared';

export default function HistoryView({ till }: { till: Till }) {
  const [open, setOpen] = useState<string | null>(null);
  const { history } = till.state;

  return (
    <div className="h-full overflow-y-auto p-3 md:p-6">
      <div className="mx-auto max-w-3xl space-y-3">
        <h1 className="text-xl font-bold">Past days</h1>
        {history.length === 0 && <p className="text-slate-500">Days you close with “Save day &amp; reset” appear here.</p>}
        {history.map((day) =>
          open === day.id ? (
            <div key={day.id} className="space-y-2">
              <button onClick={() => setOpen(null)} className="text-sm text-brand-600 underline">
                ← Back to list
              </button>
              <DaySummary day={day} />
            </div>
          ) : (
            <button
              key={day.id}
              onClick={() => setOpen(day.id)}
              className="tabular flex w-full items-center gap-3 rounded-2xl border border-brand-100 bg-white p-3 text-left shadow-sm dark:border-brand-950 dark:bg-slate-900"
            >
              <span className="flex-1">
                <span className="block font-semibold">{dayLabel(day)}</span>
                <span className="block text-sm text-slate-500">
                  {day.totals.count} sales · cash {formatPence(day.totals.cash)} · card {formatPence(day.totals.card)}
                </span>
              </span>
              <span className="text-lg font-bold">{formatPence(day.totals.total)}</span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function dayLabel(day: ClosedDay) {
  return new Date(day.openedAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function DaySummary({ day }: { day: ClosedDay }) {
  const t = day.totals;
  const download = () => {
    const url = URL.createObjectURL(new Blob([dayToCsv(day)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Till ${localDate(day.openedAt)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">{dayLabel(day)}</h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <TotalTile label="Total takings" value={formatPence(t.total)} tone="total" />
        <TotalTile label="Cash" value={formatPence(t.cash)} tone="cash" />
        <TotalTile label="Card" value={formatPence(t.card)} tone="card" />
        <TotalTile label="Sales" value={String(t.count)} />
      </div>
      <Card className="tabular grid grid-cols-1 gap-1 text-sm md:grid-cols-2">
        <span>Opening float: <strong>{formatPence(day.float)}</strong></span>
        <span>Expected in drawer: <strong>{formatPence(t.expectedDrawer)}</strong></span>
        {day.countedCash !== undefined && (
          <>
            <span>Counted: <strong>{formatPence(day.countedCash)}</strong></span>
            <span>
              Over / short: <strong>{formatPence(day.countedCash - t.expectedDrawer)}</strong>
            </span>
          </>
        )}
        {t.voidedCount > 0 && <span>Voided sales: {t.voidedCount}</span>}
        <span>
          Closed {new Date(day.closedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      </Card>
      <Card>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-bold">Transactions</h3>
          <button onClick={download} className="text-sm text-brand-600 underline">
            Download CSV
          </button>
        </div>
        <SaleList sales={day.sales} />
      </Card>
    </div>
  );
}
