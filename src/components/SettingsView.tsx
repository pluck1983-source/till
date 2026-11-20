import { useState } from 'react';
import type { OtherTill, Till } from '../lib/useTill';
import { formatPence, newId } from '../lib/model';
import { Card, MoneyInput } from './shared';

export default function SettingsView({ till }: { till: Till }) {
  return (
    <div className="h-full overflow-y-auto p-3 md:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-xl font-bold">Settings</h1>
        <TillNameCard till={till} />
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

function TillNameCard({ till }: { till: Till }) {
  return (
    <Card className="space-y-2">
      <h2 className="font-bold">This till</h2>
      <p className="text-sm text-slate-500">
        Give each device its own name. It labels this till's saved days and its line in the All tills total.
      </p>
      <input
        key={till.state.tillId}
        defaultValue={till.state.tillName}
        onBlur={(e) => till.setTillName(e.target.value)}
        aria-label="Till name"
        placeholder="e.g. iPad, Front counter"
        className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-2 py-2 dark:border-slate-700 dark:bg-slate-900"
      />
    </Card>
  );
}

function GoogleCard({ till }: { till: Till }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [others, setOthers] = useState<OtherTill[] | null>(null);
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
          Each closed day is saved as a Google Sheet in a <strong>Till records</strong> folder in your Drive. Every device
          keeps its own backup there too, so several tills can save at the same time. Connect each device to the same Google
          account. The till only sees files it creates.
        </p>
      </div>
      {linked ? (
        <>
          <p className="text-sm">
            Status:{' '}
            <strong>
              {{ saved: 'Saved', saving: 'Saving…', reconnect: 'Sign-in expired - reconnect to save', error: 'Last save failed', off: 'Off' }[till.sync]}
            </strong>
            {till.state.outbox.length > 0 && ` · ${till.state.outbox.length} day(s) waiting to upload`}
          </p>
          {till.syncError && <p className="text-sm text-amber-700">{till.syncError}</p>}
          <div className="flex flex-wrap gap-2">
            {(till.sync === 'reconnect' || till.sync === 'error') && (
              <button onClick={till.reconnectDrive} className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white">
                Reconnect Google
              </button>
            )}
            <button
              onClick={async () => {
                setMsg(null);
                try {
                  const list = await till.listOtherTills();
                  setOthers(list);
                  if (list.length === 0) setMsg('No other tills have saved to this Google account yet.');
                } catch (err) {
                  setMsg(err instanceof Error ? err.message : String(err));
                }
              }}
              className="rounded-lg bg-slate-200 px-4 py-2 font-semibold dark:bg-slate-800"
            >
              Take over another till…
            </button>
            <button onClick={() => void till.disconnectDrive()} className="rounded-lg px-4 py-2 text-brand-600 underline">
              Disconnect
            </button>
          </div>
          {others && others.length > 0 && (
            <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950">
              <p>
                For when a device has died: this device carries on as the till you pick, with its sales so far today and its
                history. <strong>This device's own sales and history are replaced</strong>, and the other device should
                not be used as a till again.
              </p>
              {others.map((o) => (
                <div key={o.fileId} className="flex flex-wrap items-center gap-2">
                  <span className="flex-1">
                    <strong>{o.name}</strong>{' '}
                    <span className="text-slate-500">
                      last saved {new Date(o.modifiedTime).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </span>
                  <button
                    onClick={async () => {
                      if (!confirm(`Replace everything on this device with till "${o.name}"?`)) return;
                      try {
                        setMsg(await till.takeOverTill(o));
                        setOthers(null);
                      } catch (err) {
                        setMsg(err instanceof Error ? err.message : String(err));
                      }
                    }}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 font-semibold text-white"
                  >
                    Take over
                  </button>
                </div>
              ))}
              <button onClick={() => setOthers(null)} className="text-slate-500 underline">
                Cancel
              </button>
            </div>
          )}
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
