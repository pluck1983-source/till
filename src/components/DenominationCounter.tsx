import { useState } from 'react';
import { COIN_BAGS, DENOMINATIONS, bagKey, countsTotal, formatPence, type Counts } from '../lib/model';
import { MoneyInput } from './shared';

/**
 * Full-screen count of notes and coins: tap + / − or type how many of each.
 * Used for the opening float and the cash-up.
 */
export default function DenominationCounter({
  title,
  hint,
  initial,
  expected,
  onSave,
  onCancel,
  amountEntry,
}: {
  title: string;
  hint?: string;
  initial?: Counts;
  /** When given, shows over/short against this amount as you count */
  expected?: number;
  onSave: (counts: Counts) => void;
  onCancel: () => void;
  /**
   * Also offers typing the whole amount, or adding/taking off an amount from
   * `current`. Saving that way calls `onSave` with the amount and no breakdown.
   */
  amountEntry?: {
    current: number;
    onSaveAmount: (amount: number) => void;
    /** Label over the typed total, e.g. "The whole float" */
    totalLabel?: string;
    /** Offer "Add or take off" (default true) */
    adjust?: boolean;
  };
}) {
  const [counts, setCounts] = useState<Counts>(() => ({ ...initial }));
  const [mode, setMode] = useState<'count' | 'total' | 'adjust'>('count');
  const [typed, setTyped] = useState<number | undefined>(amountEntry?.current || undefined);
  const [change, setChange] = useState<number | undefined>(undefined);
  const [sign, setSign] = useState<1 | -1>(1);
  const current = amountEntry?.current ?? 0;
  const total =
    mode === 'count' ? countsTotal(counts) : mode === 'total' ? (typed ?? 0) : Math.max(0, current + sign * (change ?? 0));
  const set = (key: string | number, n: number) => setCounts((c) => ({ ...c, [key]: Math.max(0, Math.min(9999, n)) }));
  const diff = expected === undefined ? null : total - expected;

  return (
    <div className="pt-safe pb-safe px-safe fixed inset-0 z-50 flex flex-col bg-[#fdf4f5] dark:bg-[#120a0e]" role="dialog" aria-label={title}>
      <div className="flex shrink-0 items-center gap-3 border-b border-brand-100 bg-white px-3 py-2 dark:border-brand-950 dark:bg-slate-950">
        <h2 className="flex-1 text-lg font-bold">{title}</h2>
        {mode === 'count' && (
          <button onClick={() => setCounts({})} className="px-2 text-sm text-slate-500 underline">
            Clear all
          </button>
        )}
      </div>

      {amountEntry && (
        <div className="flex shrink-0 gap-1 border-b border-brand-100 bg-white px-3 pb-2 dark:border-brand-950 dark:bg-slate-950">
          {(
            [
              ['count', 'Count notes & coins'],
              ['total', 'Type the total'],
              ...(current > 0 && amountEntry.adjust !== false ? [['adjust', 'Add or take off'] as const] : []),
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                mode === m ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {mode === 'total' && (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <div className="mx-auto max-w-md space-y-2">
            <label className="block text-sm font-semibold">{amountEntry?.totalLabel ?? 'The whole float'}</label>
            <MoneyInput value={typed} onChange={setTyped} className="w-48 text-2xl" ariaLabel={amountEntry?.totalLabel ?? 'Float total'} />
            {initial && countsTotal(initial) > 0 && (
              <p className="text-sm text-slate-500">Saving a typed total replaces the note-and-coin breakdown.</p>
            )}
          </div>
        </div>
      )}

      {mode === 'adjust' && (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <div className="tabular mx-auto max-w-md space-y-3">
            <p className="text-sm">
              Float now: <strong>{formatPence(current)}</strong>
            </p>
            <div className="flex gap-1">
              {([1, -1] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSign(s)}
                  className={`rounded-lg px-4 py-2 font-semibold ${
                    sign === s ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  {s === 1 ? 'Add' : 'Take off'}
                </button>
              ))}
            </div>
            <MoneyInput value={change} onChange={setChange} className="w-48 text-2xl" ariaLabel="Amount to change the float by" />
            <p className="text-sm">
              New float: <strong>{formatPence(total)}</strong>
            </p>
            {initial && countsTotal(initial) > 0 && (
              <p className="text-sm text-slate-500">Saving replaces the note-and-coin breakdown with the new total.</p>
            )}
          </div>
        </div>
      )}

      <div className={`min-h-0 flex-1 overflow-y-auto px-3 py-2 split:py-1 ${mode === 'count' ? '' : 'hidden'}`}>
        {hint && <p className="mb-1 text-sm text-slate-500">{hint}</p>}
        <div className="mx-auto grid max-w-3xl gap-x-6 split:grid-cols-2">
          {(
            [
              ['Notes', DENOMINATIONS.filter((d) => d.kind === 'note').map((d) => ({ key: String(d.value), label: d.label, unit: d.value, sub: '' }))],
              ['Coins', DENOMINATIONS.filter((d) => d.kind === 'coin').map((d) => ({ key: String(d.value), label: d.label, unit: d.value, sub: '' }))],
              ['Coin bags', COIN_BAGS.map((b) => ({ key: bagKey(b.coin), label: b.label, unit: b.value, sub: `${formatPence(b.value).replace('.00', '')} each` }))],
            ] as const
          ).map(([heading, rows]) => (
            <div key={heading} className={heading === 'Coin bags' ? 'split:col-span-2' : ''}>
              <h3 className="mt-1 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 split:mt-0.5 split:mb-0.5">{heading}</h3>
              {/* Bags sit across the bottom in two columns on the iPad */}
              <div className={heading === 'Coin bags' ? 'grid gap-x-6 split:grid-flow-col split:grid-cols-2 split:grid-rows-4' : ''}>
              {rows.map((d) => {
                const n = counts[d.key] ?? 0;
                return (
                  <div key={d.key} className="tabular flex items-center gap-2 border-b border-brand-100 py-1.5 split:py-1 dark:border-brand-950">
                    <span className="w-20 shrink-0 leading-tight">
                      <span className="block font-bold">{d.label}</span>
                      {d.sub && <span className="block text-[11px] text-slate-500">{d.sub}</span>}
                    </span>
                    <button
                      onClick={() => set(d.key, n - 1)}
                      disabled={n === 0}
                      className="h-10 w-10 rounded-lg bg-slate-100 text-xl font-bold disabled:opacity-30 split:h-9 dark:bg-slate-800"
                      aria-label={`One fewer ${d.label}`}
                    >
                      −
                    </button>
                    <input
                      inputMode="numeric"
                      value={n || ''}
                      placeholder="0"
                      onChange={(e) => set(d.key, Number(e.target.value.replace(/\D/g, '')) || 0)}
                      onFocus={(e) => e.target.select()}
                      aria-label={`Number of ${d.label}`}
                      className="h-10 w-16 rounded-lg border border-slate-300 bg-white text-center split:h-9 dark:border-slate-700 dark:bg-slate-900"
                    />
                    <button
                      onClick={() => set(d.key, n + 1)}
                      className="h-10 w-10 rounded-lg bg-slate-100 text-xl font-bold split:h-9 dark:bg-slate-800"
                      aria-label={`One more ${d.label}`}
                    >
                      +
                    </button>
                    <AmountCell unit={d.unit} label={d.label} n={n} onCount={(count) => set(d.key, count)} />
                  </div>
                );
              })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="tabular shrink-0 border-t border-brand-100 bg-white px-3 py-2 dark:border-brand-950 dark:bg-slate-950">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex-1">
            <div className="text-2xl font-bold">Total {formatPence(total)}</div>
            {diff !== null && (
              <div className={`text-sm font-semibold ${diff === 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700'}`}>
                {diff === 0 ? 'Balances' : `${diff > 0 ? 'Over' : 'Short'} by ${formatPence(Math.abs(diff))}`} · should be{' '}
                {formatPence(expected!)}
              </div>
            )}
          </div>
          <button onClick={onCancel} className="h-12 rounded-xl bg-slate-200 px-5 font-semibold dark:bg-slate-800">
            Cancel
          </button>
          <button
            onClick={() => (mode === 'count' || !amountEntry ? onSave(counts) : amountEntry.onSaveAmount(total))}
            disabled={mode === 'total' && typed === undefined}
            className="h-12 rounded-xl bg-brand-600 px-6 font-bold text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The row's value, which can also be typed: an amount that's an exact
 * multiple of the note/coin/bag sets the count. Anything else is flagged
 * and leaves the count as it was.
 */
function AmountCell({ unit, label, n, onCount }: { unit: number; label: string; n: number; onCount: (count: number) => void }) {
  const [text, setText] = useState<string | null>(null); // null while not being typed in
  const shown = text ?? (n ? (unit * n / 100).toFixed(2) : '');
  const pence = text === null || text === '' ? null : Math.round(Number(text) * 100);
  const bad = pence !== null && (Number.isNaN(pence) || pence % unit !== 0);

  return (
    <span className="flex flex-1 flex-col items-end">
      <span
        className={`inline-flex h-10 w-24 items-center rounded-lg border bg-white px-2 split:h-9 dark:bg-slate-900 ${
          bad ? 'border-amber-500 ring-2 ring-amber-300' : 'border-slate-300 dark:border-slate-700'
        }`}
      >
        <span className="text-slate-500">£</span>
        <input
          inputMode="decimal"
          value={shown}
          placeholder="0.00"
          aria-label={`Amount in ${label}`}
          onFocus={(e) => {
            setText(shown);
            e.target.select();
          }}
          onChange={(e) => {
            const t = e.target.value.replace(/[^\d.]/g, '');
            setText(t);
            const p = t === '' ? 0 : Math.round(Number(t) * 100);
            if (!Number.isNaN(p) && p % unit === 0) onCount(p / unit);
          }}
          onBlur={() => setText(null)}
          className="w-full min-w-0 bg-transparent pl-1 text-right outline-none"
        />
      </span>
      {bad && <span className="text-[11px] text-amber-700">{label.endsWith('bag') ? `not whole ${label}s` : `not a multiple of ${label}`}</span>}
    </span>
  );
}
