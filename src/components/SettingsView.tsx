import { useState } from 'react';
import type { Till } from '../lib/useTill';
import { formatPence, newId } from '../lib/model';
import { Card, MoneyInput } from './shared';

export default function SettingsView({ till }: { till: Till }) {
  return (
    <div className="h-full overflow-y-auto p-3 md:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-xl font-bold">Settings</h1>
        <QuickItemsEditor till={till} />
        <GoogleCard till={till} />
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

function GoogleCard({ till }: { till: Till }) {
  const [msg, setMsg] = useState<string | null>(null);
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
          Each closed day is saved as a Google Sheet in a <strong>Till records</strong> folder in your Drive, and a backup of
          the till is kept there so your iPhone can pick up where the iPad left off. The till only sees files it creates.
        </p>
      </div>
      {linked ? (
        <>
          <p className="text-sm">
            Status:{' '}
            <strong>
              {{ saved: 'Saved', saving: 'Saving…', reconnect: 'Sign-in expired - reconnect to save', error: 'Last save failed', off: 'Off', choose: 'Waiting for you to choose (below)' }[till.sync]}
            </strong>
            {till.state.outbox.length > 0 && ` · ${till.state.outbox.length} day(s) waiting to upload`}
          </p>
          {till.syncError && <p className="text-sm text-amber-700">{till.syncError}</p>}
          {till.sync === 'choose' && (
            <div className="space-y-2 rounded-lg bg-amber-100 p-3 text-sm text-amber-950">
              <p>
                Google Drive already has a till backup from another device, and this device has its own sales. Which should
                win? (Nothing has been overwritten yet.)
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={async () => setMsg(await till.restoreFromDrive())}
                  className="rounded-lg bg-brand-600 px-3 py-2 font-semibold text-white"
                >
                  Use the Google copy
                </button>
                <button
                  onClick={() => {
                    if (confirm("Overwrite the Google Drive backup with this device's till?")) till.keepThisDevice();
                  }}
                  className="rounded-lg bg-white px-3 py-2 font-semibold"
                >
                  Keep this device's
                </button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {(till.sync === 'reconnect' || till.sync === 'error') && (
              <button onClick={till.reconnectDrive} className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white">
                Reconnect Google
              </button>
            )}
            <button
              onClick={async () => {
                if (!confirm('Replace everything on this device (today, history and quick items) with the copy saved in Google Drive?')) return;
                try {
                  setMsg(await till.restoreFromDrive());
                } catch (err) {
                  setMsg(err instanceof Error ? err.message : String(err));
                }
              }}
              className="rounded-lg bg-slate-200 px-4 py-2 font-semibold dark:bg-slate-800"
            >
              Restore from Google Drive
            </button>
            <button onClick={() => void till.disconnectDrive()} className="rounded-lg px-4 py-2 text-brand-600 underline">
              Disconnect
            </button>
          </div>
          {msg && <p className="text-sm">{msg}</p>}
        </>
      ) : (
        <button onClick={till.connectDrive} className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white">
          Connect Google account
        </button>
      )}
    </Card>
  );
}
