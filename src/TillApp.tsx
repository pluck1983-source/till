import { useState } from 'react';
import { useTill, type SyncStatus, type Till } from './lib/useTill';
import { dayTotals, formatPence, type DayTotals } from './lib/model';
import TillView from './components/TillView';
import TodayView from './components/TodayView';
import HistoryView from './components/HistoryView';
import SettingsView from './components/SettingsView';

type Tab = 'till' | 'today' | 'history' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'till', label: 'Till' },
  { id: 'today', label: 'Today' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
];

export default function TillApp() {
  const till = useTill();
  const [tab, setTab] = useState<Tab>('till');
  const totals = dayTotals(till.state.day);

  return (
    <div className="flex h-full flex-col text-slate-900 dark:text-slate-100">
      <header className="pt-safe px-safe shrink-0 bg-brand-600 text-white shadow-sm">
        <div className="flex items-center gap-3 px-3 py-2 md:px-4">
          <span className="font-script text-2xl leading-none">Till</span>
          <TotalsStrip totals={totals} onClick={() => setTab('today')} />
          <SyncBadge status={till.sync} till={till} onClick={() => setTab('settings')} />
          <nav className="ml-2 hidden gap-1 md:flex">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  tab === t.id ? 'bg-white text-brand-700' : 'text-brand-50 hover:bg-brand-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="px-safe min-h-0 flex-1">
        {tab === 'till' && <TillView till={till} />}
        {tab === 'today' && <TodayView till={till} />}
        {tab === 'history' && <HistoryView till={till} />}
        {tab === 'settings' && <SettingsView till={till} />}
      </main>

      <nav className="pb-safe px-safe grid shrink-0 grid-cols-4 border-t border-brand-100 bg-white md:hidden dark:border-brand-950 dark:bg-slate-950">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`py-3 text-sm font-semibold ${
              tab === t.id ? 'text-brand-600 dark:text-brand-300' : 'text-slate-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function TotalsStrip({ totals, onClick }: { totals: DayTotals; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="tabular flex min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-lg px-2 py-1 text-left text-sm hover:bg-brand-700 md:gap-5"
      aria-label="Today's totals"
    >
      <Stat label="Total" value={formatPence(totals.total)} strong />
      <Stat label="Cash" value={formatPence(totals.cash)} />
      <Stat label="Card" value={formatPence(totals.card)} />
      <Stat label="In till" value={formatPence(totals.expectedDrawer)} className="hidden sm:block" />
      <Stat label="Sales" value={String(totals.count)} className="hidden lg:block" />
    </button>
  );
}

function Stat({ label, value, strong, className = '' }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <span className={`min-w-0 leading-tight ${className}`}>
      <span className="block text-[11px] uppercase tracking-wide text-brand-100">{label}</span>
      <span className={`block truncate ${strong ? 'text-base font-bold' : 'font-semibold'}`}>{value}</span>
    </span>
  );
}

function SyncBadge({ status, till, onClick }: { status: SyncStatus; till: Till; onClick: () => void }) {
  if (status === 'off') return null;
  const map: Record<Exclude<SyncStatus, 'off'>, { text: string; cls: string }> = {
    saved: { text: 'Saved to Google', cls: 'bg-brand-700/60' },
    saving: { text: 'Saving…', cls: 'bg-brand-700/60' },
    reconnect: { text: 'Reconnect Google', cls: 'bg-amber-400 text-amber-950' },
    error: { text: 'Google save failed', cls: 'bg-amber-400 text-amber-950' },
  };
  const { text, cls } = map[status];
  const action = status === 'reconnect' ? till.reconnectDrive : status === 'error' ? () => void till.syncNow() : onClick;
  return (
    <button onClick={action} className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>
      <span className="hidden sm:inline">{text}</span>
      <span className="sm:hidden">{status === 'saved' ? '✓' : status === 'saving' ? '…' : '!'}</span>
    </button>
  );
}
