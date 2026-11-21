import { useState } from 'react';
import type { Till } from '../lib/useTill';
import { formatPence, newId } from '../lib/model';
import { Card, MoneyInput } from './shared';

export default function SettingsView({ till }: { till: Till }) {
  return (
    <div className="h-full overflow-y-auto p-3 md:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-xl font-bold">Settings</h1>
        <DeviceCard till={till} />
        <QuickItemsEditor till={till} />
        <GoogleCard till={till} />
        <ResetCard till={till} />
      </div>
    </div>
  );
}

function QuickItemsEditor({ till }: { till: Till }) {
  const [label, setLabel] = useState('');
  const [price, setPrice] = useState<number | undefined>(undefined);
  const [formKey, setFormKey] = useState(0);
  const items = till.state.quickItems;

  const add = () => {
    if (!label.trim() || !price) return;
    till.setQuickItems([...items, { id: newId(), label: label.trim(), price }]);
    setLabel('');
    setPrice(undefined);
    setFormKey((k) => k + 1);
  };

  const move = (i: number, d: number) => {
    const next = [...items];
    const [it] = next.splice(i, 1);
    next.splice(i + d, 0, it);
    till.setQuickItems(next);
  };

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-bold">Quick items</h2>
        <p className="text-sm text-slate-500">One-tap buttons on the till for things you sell often.</p>
      </div>
      <ul className="divide-y divide-brand-100 dark:divide-brand-950">
        {items.map((q, i) => (
          <li key={q.id} className="flex items-center gap-2 py-2">
            <span className="flex-1">{q.label}</span>
            <span className="tabular w-20 text-right">{formatPence(q.price)}</span>
            <button disabled={i === 0} onClick={() => move(i, -1)} className="h-9 w-9 rounded-lg bg-slate-100 disabled:opacity-30 dark:bg-slate-800" aria-label="Move up">↑</button>
            <button disabled={i === items.length - 1} onClick={() => move(i, 1)} className="h-9 w-9 rounded-lg bg-slate-100 disabled:opacity-30 dark:bg-slate-800" aria-label="Move down">↓</button>
            <button onClick={() => till.setQuickItems(items.filter((x) => x.id !== q.id))} className="px-2 text-sm text-brand-600 underline">
              Delete
            </button>
          </li>
        ))}
      </ul>
      <form
        key={formKey}
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Name, e.g. Coffee"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
        <MoneyInput value={price} onChange={setPrice} className="w-28" ariaLabel="Price" />
        <button type="submit" disabled={!label.trim() || !price} className="rounded-lg bg-brand-600 px-4 font-semibold text-white disabled:opacity-40">
          Add
        </button>
      </form>
    </Card>
  );
}

function DeviceCard({ till }: { till: Till }) {
  return (
    <Card className="space-y-2">
      <h2 className="font-bold">This device</h2>
      <p className="text-sm text-slate-500">
        The cashier name is stamped on every sale rung up here, so Today can show each cashier's takings.
      </p>
      <input
        defaultValue={till.state.deviceName}
        onBlur={(e) => till.setDeviceName(e.target.value)}
        aria-label="Cashier name"
        placeholder="e.g. Sam, or iPad"
        className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900"
      />
      <p className="text-xs text-slate-500">
        Device ID:{' '}
        {till.state.deviceId ? (
          <code>{till.state.deviceId.slice(0, 8)}</code>
        ) : (
          'given when this device first connects to Google Drive'
        )}
      </p>
    </Card>
  );
}

function GoogleCard({ till }: { till: Till }) {
  const linked = till.state.driveLinked;

  if (!till.driveConfigured) {
    return (
      <Card>
        <h2 className="font-bold">Google Drive</h2>
        <p className="text-sm text-slate-500">This build has no Google sign-in configured. Everything is saved on this device only.</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="font-bold">Google Drive</h2>
        <p className="text-sm text-slate-500">
          Connect every cashier's device to the <strong>same Google account</strong>. They share one till: one float, one
          set of sales in <strong>Till data.json</strong>, kept in step every few seconds. Each closed day is also saved as a
          Google Sheet. Everything is in a <strong>Till records</strong> folder in your Drive; the till only sees files it
          creates.
        </p>
      </div>
      {linked ? (
        <>
          <p className="text-sm">
            Status:{' '}
            <strong>
              {{ saved: 'In sync', saving: 'Saving…', reconnect: 'Sign-in expired - reconnect to sync', error: 'Last sync failed', off: 'Off' }[till.sync]}
            </strong>
            {till.state.lastSyncedAt &&
              ` · last synced ${new Date(till.state.lastSyncedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
            {till.state.outbox.length > 0 && ` · ${till.state.outbox.length} day(s) waiting to upload`}
          </p>
          {till.syncError && <p className="text-sm text-amber-700">{till.syncError}</p>}
          <div className="flex flex-wrap gap-2">
            {till.sync === 'reconnect' || till.sync === 'error' ? (
              <button onClick={till.reconnectDrive} className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white">
                Reconnect Google
              </button>
            ) : (
              <button onClick={() => void till.syncNow()} className="rounded-lg bg-slate-200 px-4 py-2 font-semibold dark:bg-slate-800">
                Sync now
              </button>
            )}
            <button onClick={() => void till.disconnectDrive()} className="rounded-lg px-4 py-2 text-brand-600 underline">
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <button onClick={till.connectDrive} className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white">
          Connect Google account
        </button>
      )}
    </Card>
  );
}

function ResetCard({ till }: { till: Till }) {
  const sales = till.state.day.sales.length + till.state.history.reduce((n, d) => n + d.sales.length, 0);
  return (
    <Card className="space-y-2">
      <h2 className="font-bold">Reset till</h2>
      {till.state.driveLinked ? (
        <p className="text-sm text-slate-500">
          This device is connected to Google Drive, so a reset here would just copy everything back from Drive. Disconnect
          first if you really want to start again - nothing in your Drive is deleted either way.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-500">
            Clears this device back to a brand-new till: today's sales, past days, quick items, float and cashier name
            {sales > 0 ? ` (${sales} sale${sales === 1 ? '' : 's'} in total)` : ''}. Use it to remove test sales before you
            start trading. It can't be undone.
          </p>
          <button
            onClick={() => {
              if (!confirm('Delete every sale, past day and quick item on this device?')) return;
              if (!confirm('Are you sure? This cannot be undone.')) return;
              till.resetTill();
            }}
            className="rounded-lg border-2 border-red-600 px-4 py-2 font-semibold text-red-700 dark:text-red-400"
          >
            Reset till…
          </button>
        </>
      )}
    </Card>
  );
}
