import { useState, type ReactNode } from 'react';
import { formatPence, type Sale } from '../lib/model';

/** Money field: type pounds (e.g. 12.50), stored as pence. */
export function MoneyInput({
  value,
  onChange,
  placeholder = '0.00',
  className = '',
  ariaLabel,
}: {
  value: number | undefined;
  onChange: (pence: number | undefined) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(value === undefined ? '' : (value / 100).toFixed(2));
  return (
    <span className={`inline-flex items-center rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-900 ${className}`}>
      <span className="text-slate-500">£</span>
      <input
        inputMode="decimal"
        aria-label={ariaLabel}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.]/g, '');
          setText(t);
          const n = Number(t);
          onChange(t === '' || Number.isNaN(n) ? undefined : Math.round(n * 100));
        }}
        className="tabular w-full min-w-0 bg-transparent py-2 pl-1 outline-none"
      />
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-brand-100 bg-white p-4 shadow-sm dark:border-brand-950 dark:bg-slate-900 ${className}`}>
      {children}
    </div>
  );
}

export function TotalTile({ label, value, tone = 'plain' }: { label: string; value: string; tone?: 'plain' | 'cash' | 'card' | 'total' }) {
  const toneCls = {
    plain: 'bg-white dark:bg-slate-900',
    total: 'bg-brand-600 text-white',
    cash: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
    card: 'bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200',
  }[tone];
  return (
    <div className={`tabular rounded-2xl border border-brand-100 p-3 dark:border-brand-950 ${toneCls}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-75">{label}</p>
      <p className="text-2xl font-bold md:text-3xl">{value}</p>
    </div>
  );
}

export function SaleList({ sales, onToggleVoid }: { sales: Sale[]; onToggleVoid?: (id: string) => void }) {
  if (sales.length === 0) return <p className="py-6 text-center text-slate-400">No sales yet</p>;
  return (
    <ul className="divide-y divide-brand-100 dark:divide-brand-950">
      {[...sales].reverse().map((sale) => {
        const total = sale.payments.reduce((s, p) => s + p.amount, 0);
        const methods = [...new Set(sale.payments.map((p) => p.method))].join(' + ');
        const tendered = sale.payments.find((p) => p.tendered);
        return (
          <li key={sale.id} className={`flex items-center gap-3 py-2 ${sale.voidedAt ? 'opacity-50' : ''}`}>
            <span className="tabular w-12 text-sm text-slate-500">
              {new Date(sale.completedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate ${sale.voidedAt ? 'line-through' : ''}`}>
                {sale.lines.map((l) => `${l.qty > 1 ? `${l.qty}× ` : ''}${l.label || formatPence(l.price)}`).join(', ')}
              </span>
              <span className="block text-xs text-slate-500">
                <span className="capitalize">{methods}</span>
                {tendered?.tendered && ` · ${formatPence(tendered.tendered)} given`}
                {sale.voidedAt && ' · voided'}
              </span>
            </span>
            <span className={`tabular font-semibold ${sale.voidedAt ? 'line-through' : ''}`}>{formatPence(total)}</span>
            {onToggleVoid && (
              <button
                onClick={() => {
                  if (sale.voidedAt || confirm(`Void this ${formatPence(total)} sale? It stays on the record but leaves the totals.`))
                    onToggleVoid(sale.id);
                }}
                className="rounded-lg px-2 py-1 text-sm text-brand-600 underline"
              >
                {sale.voidedAt ? 'Restore' : 'Void'}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
