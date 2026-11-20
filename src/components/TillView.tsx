import { useState } from 'react';
import type { Till } from '../lib/useTill';
import { cashSuggestions, formatPence, keypadPress, linesTotal, paidTotal, parsePence } from '../lib/model';

const KEYS = ['7', '8', '9', 'back', '4', '5', '6', 'clear', '1', '2', '3', '00', '0', '.'];

export default function TillView({ till }: { till: Till }) {
  const [entry, setEntry] = useState('');
  const { lines, payments } = till.state.current;
  const subtotal = linesTotal(lines);
  const paid = paidTotal(payments);
  const owed = subtotal - paid;
  const entryPence = parsePence(entry);
  const hasSale = lines.length > 0;

  const press = (key: string) => {
    if (key === '00') setEntry((t) => keypadPress(keypadPress(t, '0'), '0'));
    else setEntry((t) => keypadPress(t, key));
  };

  const addItem = (price = entryPence, label = '') => {
    if (price <= 0) return;
    till.addLine(price, label);
    setEntry('');
  };

  const pay = (method: 'cash' | 'card', amount?: number) => {
    till.pay(method, amount ?? (entryPence || undefined));
    setEntry('');
  };

  return (
    <div className="flex h-full flex-col md:grid md:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
      {/* Sale */}
      <section className="flex min-h-0 flex-1 flex-col border-brand-100 md:border-r dark:border-brand-950">
        {till.state.quickItems.length > 0 && (
          <div className="flex shrink-0 gap-2 overflow-x-auto p-2 md:flex-wrap md:p-3">
            {till.state.quickItems.map((q) => (
              <button
                key={q.id}
                onClick={() => addItem(q.price, q.label)}
                className="shrink-0 rounded-xl border border-brand-200 bg-white px-3 py-2 text-left shadow-sm active:bg-brand-50 md:min-w-28 md:py-3 dark:border-brand-900 dark:bg-slate-900"
              >
                <span className="block text-sm font-semibold">{q.label}</span>
                <span className="tabular block text-xs text-slate-500">{formatPence(q.price)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-3 md:px-4">
          {!hasSale && till.lastChange && <ChangeDue change={till.lastChange.change} total={till.lastChange.total} />}
          {!hasSale && !till.lastChange && (
            <p className="py-10 text-center text-slate-400">Key in a price and tap Add item</p>
          )}
          {hasSale && (
            <ul className="divide-y divide-brand-100 dark:divide-brand-950">
              {lines.map((l, i) => (
                <li key={l.id} className="flex items-center gap-2 py-2">
                  <span className="w-6 text-sm text-slate-400">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {l.label || 'Item'}
                    {l.qty > 1 && <span className="tabular text-slate-500"> × {l.qty} @ {formatPence(l.price)}</span>}
                  </span>
                  <span className="tabular w-24 text-right font-semibold">{formatPence(l.price * l.qty)}</span>
                  <button
                    onClick={() => till.changeQty(l.id, -1)}
                    className="h-10 w-10 rounded-lg bg-slate-100 text-lg font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    aria-label={l.qty > 1 ? 'One fewer' : 'Remove item'}
                  >
                    {l.qty > 1 ? '−' : '×'}
                  </button>
                  <button
                    onClick={() => till.changeQty(l.id, 1)}
                    className="h-10 w-10 rounded-lg bg-slate-100 text-lg font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    aria-label="One more"
                  >
                    +
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {hasSale && (
          <div className="tabular shrink-0 border-t border-brand-100 bg-white px-3 py-2 md:px-4 md:py-3 dark:border-brand-950 dark:bg-slate-950">
            <Row label="Subtotal" value={formatPence(subtotal)} big={payments.length === 0} />
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
                <span>
                  Paid by {p.method}
                  <button onClick={() => till.removePayment(p.id)} className="ml-2 text-brand-600 underline">
                    undo
                  </button>
                </span>
                <span>−{formatPence(p.amount)}</span>
              </div>
            ))}
            {payments.length > 0 && <Row label="Left to pay" value={formatPence(owed)} big />}
            <button onClick={till.clearSale} className="mt-1 text-sm text-slate-500 underline">
              Clear sale
            </button>
          </div>
        )}
      </section>

      {/* Keypad */}
      <section className="pb-2 shrink-0 bg-white p-2 md:flex md:flex-col md:justify-end md:p-4 dark:bg-slate-950">
        <div className="tabular mb-2 flex h-14 items-center justify-end rounded-xl bg-brand-50 px-4 text-3xl font-bold md:h-20 md:text-4xl dark:bg-brand-950">
          {entry ? `£${entry}` : <span className="text-brand-300 dark:text-brand-800">£0.00</span>}
        </div>

        <div className="grid grid-cols-4 gap-1.5 md:gap-2">
          {KEYS.map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              className={`h-12 rounded-xl text-xl font-semibold active:scale-95 md:h-16 md:text-2xl ${
                k === 'back' || k === 'clear'
                  ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  : 'bg-slate-100 dark:bg-slate-900'
              }`}
            >
              {k === 'back' ? '⌫' : k === 'clear' ? 'C' : k}
            </button>
          ))}
          <button
            onClick={() => addItem()}
            disabled={entryPence <= 0}
            className="col-span-2 h-12 rounded-xl bg-brand-600 text-lg font-bold text-white active:scale-95 disabled:opacity-40 md:h-16 md:text-xl"
          >
            Add item
          </button>
        </div>

        {owed > 0 && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto md:gap-2">
            <QuickCash label="Exact" amount={owed} onClick={() => pay('cash', owed)} />
            {cashSuggestions(owed).map((a) => (
              <QuickCash key={a} label={formatPence(a).replace('.00', '')} amount={a} onClick={() => pay('cash', a)} />
            ))}
          </div>
        )}

        <div className="mt-2 grid grid-cols-2 gap-1.5 md:gap-2">
          <button
            onClick={() => pay('cash')}
            disabled={owed <= 0}
            className="h-14 rounded-xl bg-emerald-600 text-lg font-bold text-white active:scale-95 disabled:opacity-40 md:h-20 md:text-xl"
          >
            Cash
            <span className="block text-xs font-medium opacity-90">
              {owed > 0 ? (entryPence ? `${formatPence(entryPence)} given` : formatPence(owed)) : ' '}
            </span>
          </button>
          <button
            onClick={() => pay('card')}
            disabled={owed <= 0}
            className="h-14 rounded-xl bg-brand-800 text-lg font-bold text-white active:scale-95 disabled:opacity-40 md:h-20 md:text-xl"
          >
            Card
            <span className="block text-xs font-medium opacity-90">
              {owed > 0 ? formatPence(entryPence && entryPence < owed ? entryPence : owed) : ' '}
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between ${big ? 'text-2xl font-bold md:text-3xl' : 'font-semibold'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function QuickCash({ label, onClick }: { label: string; amount: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="tabular h-11 flex-1 shrink-0 rounded-xl border-2 border-emerald-500 px-3 font-semibold whitespace-nowrap text-emerald-700 active:bg-emerald-50 md:h-12 dark:text-emerald-300 dark:active:bg-emerald-950"
    >
      {label}
    </button>
  );
}

function ChangeDue({ change, total }: { change: number; total: number }) {
  return (
    <div className="tabular my-6 rounded-2xl bg-emerald-50 p-6 text-center dark:bg-emerald-950">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
        {change > 0 ? 'Change due' : 'Paid'}
      </p>
      <p className="text-5xl font-bold text-emerald-700 md:text-6xl dark:text-emerald-200">
        {formatPence(change > 0 ? change : total)}
      </p>
      {change > 0 && <p className="mt-2 text-slate-600 dark:text-slate-400">Sale total {formatPence(total)}</p>}
      <p className="mt-3 text-sm text-slate-500">Key in the next item to start a new sale</p>
    </div>
  );
}
