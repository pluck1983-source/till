import { useState } from 'react';
import type { Till } from '../lib/useTill';
import { dayToCsv, describeCounts, formatPence, localDate, overShort, tradingDate, type ClosedDay } from '../lib/model';
import { CardFeeUpdate, CashPanel } from './CashPanel';
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
              <DaySummary day={day} till={till} />
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
  return new Date(tradingDate(day)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * One closed day. With `till`, its float, cash-up, voids and card fees can be
 * corrected; without it (straight after closing) it's read-only.
 */
export function DaySummary({ day, till }: { day: ClosedDay; till?: Till }) {
  const t = day.totals;
  const [edited, setEdited] = useState(false);
  const [resaved, setResaved] = useState(false);
  const download = () => {
    const url = URL.createObjectURL(new Blob([dayToCsv(day)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Till ${localDate(tradingDate(day))}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const diff = overShort(day, t);
  // Any edit made from here: note it so we can offer a corrected copy for Google Drive.
  const markEdited = () => {
    setEdited(true);
    setResaved(false);
  };
  const editingTill: Till | undefined = till && {
    ...till,
    setFloat: (...args: Parameters<Till['setFloat']>) => (markEdited(), till.setFloat(...args)),
    setCashUp: (...args: Parameters<Till['setCashUp']>) => (markEdited(), till.setCashUp(...args)),
    updateCardFees: (...args: Parameters<Till['updateCardFees']>) => (markEdited(), till.updateCardFees(...args)),
    toggleVoid: (...args: Parameters<Till['toggleVoid']>) => (markEdited(), till.toggleVoid(...args)),
  };

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">
        {dayLabel(day)}
        {day.till && <span className="text-base font-normal text-slate-500"> · closed by {day.till}</span>}
      </h2>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <TotalTile label="Total takings" value={formatPence(t.total)} tone="total" />
        <TotalTile label="Cash" value={formatPence(t.cash)} tone="cash" />
        <TotalTile label="Card" value={formatPence(t.card)} tone="card" note={t.cardFees > 0 ? `fees −${formatPence(t.cardFees)} (est.)` : undefined} />
        <TotalTile label="Sales" value={String(t.count)} />
      </div>

      {editingTill && edited && till!.state.driveLinked && (
        <Card className="flex flex-wrap items-center gap-3 border-brand-300 text-sm">
          <span className="flex-1">
            {resaved
              ? 'A corrected copy is being saved to the Till records folder in Google Drive. You can delete the old Sheet for this day there.'
              : "You've changed this day. The Google Sheet saved when it closed still has the old figures."}
          </span>
          {!resaved && (
            <button
              onClick={() => {
                till!.resaveDay(day.id);
                setResaved(true);
              }}
              className="rounded-lg bg-brand-600 px-3 py-2 font-semibold text-white"
            >
              Save corrected copy to Google Drive
            </button>
          )}
        </Card>
      )}

      {editingTill ? (
        <>
          <CardFeeUpdate till={editingTill} day={day} dayId={day.id} />
          <CashPanel till={editingTill} day={day} totals={t} dayId={day.id} />
        </>
      ) : (
        <Card className="tabular grid grid-cols-1 gap-1 text-sm md:grid-cols-2">
          <span>
            Opening float: <strong>{formatPence(day.float)}</strong>
            {day.floatCounts && <span className="block text-xs text-slate-500">{describeCounts(day.floatCounts)}</span>}
          </span>
          <span>Should be in till (float + cash): <strong>{formatPence(t.expectedDrawer)}</strong></span>
          {day.countedCash !== undefined && (
            <>
              <span>
                Counted: <strong>{formatPence(day.countedCash)}</strong>
                {day.countedCounts && <span className="block text-xs text-slate-500">{describeCounts(day.countedCounts)}</span>}
              </span>
              <span>
                Over / short: <strong>{formatPence(diff!)}</strong>
              </span>
            </>
          )}
        </Card>
      )}

      <Card className="tabular grid grid-cols-1 gap-1 text-sm md:grid-cols-2">
        {t.cardFees > 0 && (
          <span>
            Card fees (est.): <strong>−{formatPence(t.cardFees)}</strong> · after fees{' '}
            <strong>{formatPence(t.total - t.cardFees)}</strong>
          </span>
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
        <SaleList sales={day.sales} onToggleVoid={editingTill ? (id) => editingTill.toggleVoid(id, day.id) : undefined} />
      </Card>
    </div>
  );
}
