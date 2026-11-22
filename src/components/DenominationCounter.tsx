import { useState } from 'react';
import { DENOMINATIONS, countsTotal, formatPence, type Counts } from '../lib/model';

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
}: {
  title: string;
  hint?: string;
  initial?: Counts;
  /** When given, shows over/short against this amount as you count */
  expected?: number;
  onSave: (counts: Counts) => void;
  onCancel: () => void;
}) {
  const [counts, setCounts] = useState<Counts>(() => ({ ...initial }));
  const total = countsTotal(counts);
  const set = (value: number, n: number) => setCounts((c) => ({ ...c, [value]: Math.max(0, Math.min(9999, n)) }));
  const diff = expected === undefined ? null : total - expected;

  return (
    <div className="pt-safe pb-safe px-safe fixed inset-0 z-50 flex flex-col bg-[#fdf4f5] dark:bg-[#120a0e]" role="dialog" aria-label={title}>
      <div className="flex shrink-0 items-center gap-3 border-b border-brand-100 bg-white px-3 py-2 dark:border-brand-950 dark:bg-slate-950">
        <h2 className="flex-1 text-lg font-bold">{title}</h2>
        <button onClick={() => setCounts({})} className="px-2 text-sm text-slate-500 underline">
          Clear all
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {hint && <p className="mb-2 text-sm text-slate-500">{hint}</p>}
        <div className="mx-auto grid max-w-3xl gap-x-6 split:grid-cols-2">
          {(['note', 'coin'] as const).map((kind) => (
            <div key={kind}>
              <h3 className="mt-1 mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {kind === 'note' ? 'Notes' : 'Coins'}
              </h3>
              {DENOMINATIONS.filter((d) => d.kind === kind).map((d) => {
                const n = counts[d.value] ?? 0;
                return (
                  <div key={d.value} className="tabular flex items-center gap-2 border-b border-brand-100 py-1.5 dark:border-brand-950">
                    <span className="w-12 font-bold">{d.label}</span>
                    <button
                      onClick={() => set(d.value, n - 1)}
                      disabled={n === 0}
                      className="h-10 w-10 rounded-lg bg-slate-100 text-xl font-bold disabled:opacity-30 dark:bg-slate-800"
                      aria-label={`One fewer ${d.label}`}
                    >
                      −
                    </button>
                    <input
                      inputMode="numeric"
                      value={n || ''}
                      placeholder="0"
                      onChange={(e) => set(d.value, Number(e.target.value.replace(/\D/g, '')) || 0)}
                      onFocus={(e) => e.target.select()}
                      aria-label={`Number of ${d.label}`}
                      className="h-10 w-16 rounded-lg border border-slate-300 bg-white text-center dark:border-slate-700 dark:bg-slate-900"
                    />
                    <button
                      onClick={() => set(d.value, n + 1)}
                      className="h-10 w-10 rounded-lg bg-slate-100 text-xl font-bold dark:bg-slate-800"
                      aria-label={`One more ${d.label}`}
                    >
                      +
                    </button>
                    <span className="flex-1 text-right text-slate-600 dark:text-slate-400">{n ? formatPence(d.value * n) : ''}</span>
                  </div>
                );
              })}
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
          <button onClick={() => onSave(counts)} className="h-12 rounded-xl bg-brand-600 px-6 font-bold text-white">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
