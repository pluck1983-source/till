import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyCard,
  applyCash,
  closeDay,
  dayToCsv,
  localDate,
  newDay,
  newId,
  remaining,
  type ClosedDay,
  type Day,
  type Payment,
  type QuickItem,
  type SaleLine,
} from './model';
import * as drive from './googleDrive';

export interface CurrentSale {
  lines: SaleLine[];
  payments: Payment[];
}

interface OutboxItem {
  id: string;
  name: string;
  csv: string;
}

export interface TillState {
  day: Day;
  current: CurrentSale;
  history: ClosedDay[];
  quickItems: QuickItem[];
  /** Closed days waiting to be saved to Google Drive */
  outbox: OutboxItem[];
  /** True once Google Drive has been connected on this device */
  driveLinked: boolean;
  /** Bumped on every change so the backup knows there's something new */
  rev: number;
  backedUpRev: number;
  /** False until this device has checked Google Drive for an existing backup - so it never overwrites one blindly */
  backupChecked: boolean;
}

export type SyncStatus = 'off' | 'saved' | 'saving' | 'reconnect' | 'error' | 'choose';

const KEY = 'till-state-v1';
const MAX_HISTORY = 400;

const emptySale = (): CurrentSale => ({ lines: [], payments: [] });

function initial(): TillState {
  return {
    day: newDay(),
    current: emptySale(),
    history: [],
    quickItems: [],
    outbox: [],
    driveLinked: false,
    rev: 0,
    backedUpRev: 0,
    backupChecked: false,
  };
}

function load(): TillState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...initial(), ...(JSON.parse(raw) as TillState) };
  } catch {
    // fall through to a fresh till
  }
  return initial();
}

function backupPayload(s: TillState): string {
  const { day, current, history, quickItems } = s;
  return JSON.stringify({ app: 'till', version: 1, savedAt: new Date().toISOString(), day, current, history, quickItems });
}

export function useTill() {
  const [state, setState] = useState<TillState>(load);
  const [sync, setSync] = useState<SyncStatus>(() => (state.driveLinked ? 'saving' : 'off'));
  const [syncError, setSyncError] = useState<string | null>(null);
  /** Change due from the last completed sale - shown until the next sale starts */
  const [lastChange, setLastChange] = useState<{ change: number; total: number } | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked - the till keeps working in memory.
    }
  }, [state]);

  /** Applies a change and marks it for backup. */
  const update = useCallback((fn: (s: TillState) => TillState) => {
    setState((s) => {
      const next = fn(s);
      return next === s ? s : { ...next, rev: s.rev + 1 };
    });
  }, []);

  // ---- Sale editing ----------------------------------------------------

  const addLine = useCallback(
    (price: number, label = '') => {
      if (price <= 0) return;
      setLastChange(null);
      update((s) => {
        // Tapping the same quick item again bumps its quantity instead of adding a row.
        const last = s.current.lines.at(-1);
        if (label && last && last.label === label && last.price === price) {
          const lines = s.current.lines.map((l) => (l === last ? { ...l, qty: l.qty + 1 } : l));
          return { ...s, current: { ...s.current, lines } };
        }
        return { ...s, current: { ...s.current, lines: [...s.current.lines, { id: newId(), price, qty: 1, label }] } };
      });
    },
    [update],
  );

  const changeQty = useCallback(
    (lineId: string, delta: number) =>
      update((s) => {
        const lines = s.current.lines
          .map((l) => (l.id === lineId ? { ...l, qty: l.qty + delta } : l))
          .filter((l) => l.qty > 0);
        return { ...s, current: { ...s.current, lines } };
      }),
    [update],
  );

  const removePayment = useCallback(
    (paymentId: string) =>
      update((s) => ({
        ...s,
        current: { ...s.current, payments: s.current.payments.filter((p) => p.id !== paymentId) },
      })),
    [update],
  );

  const clearSale = useCallback(() => update((s) => ({ ...s, current: emptySale() })), [update]);

  /** Adds a payment; if that settles the sale, records it and starts a new one. */
  const pay = useCallback(
    (method: 'cash' | 'card', amount?: number) => {
      const s = stateRef.current;
      const owed = remaining(s.current.lines, s.current.payments);
      if (owed <= 0 || s.current.lines.length === 0) return;
      let payment: Payment;
      let change = 0;
      if (method === 'cash') {
        ({ payment, change } = applyCash(owed, amount && amount > 0 ? amount : owed));
      } else {
        payment = applyCard(owed, amount);
      }
      const payments = [...s.current.payments, payment];
      if (remaining(s.current.lines, payments) > 0) {
        update((st) => ({ ...st, current: { ...st.current, payments } }));
        return;
      }
      const total = s.current.lines.reduce((sum, l) => sum + l.price * l.qty, 0);
      setLastChange({ change, total });
      update((st) => ({
        ...st,
        day: {
          ...st.day,
          sales: [
            ...st.day.sales,
            { id: newId(), lines: st.current.lines, payments, completedAt: new Date().toISOString() },
          ],
        },
        current: emptySale(),
      }));
    },
    [update],
  );

  const toggleVoid = useCallback(
    (saleId: string) =>
      update((s) => ({
        ...s,
        day: {
          ...s.day,
          sales: s.day.sales.map((sale) =>
            sale.id === saleId
              ? sale.voidedAt
                ? { ...sale, voidedAt: undefined }
                : { ...sale, voidedAt: new Date().toISOString() }
              : sale,
          ),
        },
      })),
    [update],
  );

  const setFloat = useCallback(
    (float: number) => update((s) => ({ ...s, day: { ...s.day, float, floatSet: true } })),
    [update],
  );

  const setQuickItems = useCallback((quickItems: QuickItem[]) => update((s) => ({ ...s, quickItems })), [update]);

  /** Saves the day to history (and queues it for Google Drive), then starts a fresh day. */
  const endDay = useCallback(
    (countedCash?: number): ClosedDay => {
      const closed = closeDay(stateRef.current.day, countedCash);
      setLastChange(null);
      update((s) => ({
        ...s,
        history: [closed, ...s.history].slice(0, MAX_HISTORY),
        outbox: s.driveLinked
          ? [...s.outbox, { id: closed.id, name: `Till ${localDate(closed.openedAt)}`, csv: dayToCsv(closed) }]
          : s.outbox,
        day: newDay(),
        current: emptySale(),
      }));
      return closed;
    },
    [update],
  );

  // ---- Google Drive ----------------------------------------------------

  /** Replaces everything on this device with a backup's contents. Returns false if it isn't a till backup. */
  const applyBackup = useCallback((text: string): boolean => {
    const data = JSON.parse(text) as Partial<TillState> & { app?: string };
    if (data.app !== 'till' || !data.day) return false;
    setLastChange(null);
    setState((s) => {
      const rev = s.rev + 1;
      const next: TillState = {
        ...s,
        day: data.day!,
        current: data.current ?? emptySale(),
        history: data.history ?? [],
        quickItems: data.quickItems ?? [],
        rev,
        backedUpRev: rev,
        backupChecked: true,
      };
      stateRef.current = next;
      return next;
    });
    return true;
  }, []);

  const running = useRef(false);

  const flush = useCallback(async () => {
    const s = stateRef.current;
    if (!s.driveLinked || running.current) return;
    if (!drive.hasToken()) {
      setSync(s.outbox.length || s.rev !== s.backedUpRev ? 'reconnect' : 'saved');
      return;
    }
    if (s.outbox.length === 0 && s.rev === s.backedUpRev) {
      setSync('saved');
      return;
    }
    running.current = true;
    setSync('saving');
    try {
      if (!s.backupChecked) {
        // First save from this device: if Google already holds a till backup
        // (e.g. from the iPad), don't overwrite it with this device's copy.
        const remote = await drive.loadBackup();
        if (remote) {
          const local = stateRef.current;
          const localEmpty =
            local.day.sales.length === 0 &&
            local.current.lines.length === 0 &&
            local.history.length === 0 &&
            local.quickItems.length === 0;
          if (!localEmpty) {
            setSync('choose');
            return;
          }
          applyBackup(remote);
        }
        setState((st) => ({ ...st, backupChecked: true }));
        stateRef.current = { ...stateRef.current, backupChecked: true };
      }
      for (const item of s.outbox) {
        await drive.saveDaySheet(item.name, item.csv);
        setState((st) => ({ ...st, outbox: st.outbox.filter((o) => o.id !== item.id) }));
      }
      const rev = stateRef.current.rev;
      await drive.saveBackup(backupPayload(stateRef.current));
      setState((st) => ({ ...st, backedUpRev: rev }));
      setSyncError(null);
      setSync('saved');
    } catch (err) {
      if (err instanceof drive.AuthRequiredError) setSync('reconnect');
      else {
        setSync('error');
        setSyncError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      running.current = false;
    }
  }, [applyBackup]);

  // Back up a few seconds after the last change, so a burst of taps is one upload.
  useEffect(() => {
    if (!state.driveLinked) return;
    const t = window.setTimeout(() => void flush(), 3000);
    return () => window.clearTimeout(t);
  }, [state.rev, state.outbox.length, state.driveLinked, flush]);

  // On open: a token that has lapsed gets one silent refresh, but only when no sale is half-rung.
  useEffect(() => {
    const s = stateRef.current;
    if (s.driveLinked && !drive.hasToken() && s.current.lines.length === 0) drive.trySilentSignIn();
    const retry = () => void flush();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [flush]);

  const connectDrive = useCallback(() => {
    // Mark linked first: the sign-in navigates away and back.
    const next = { ...stateRef.current, driveLinked: true, rev: stateRef.current.rev + 1 };
    localStorage.setItem(KEY, JSON.stringify(next));
    drive.signIn(false);
  }, []);

  const disconnectDrive = useCallback(async () => {
    await drive.signOut();
    setState((s) => ({ ...s, driveLinked: false, outbox: [], backupChecked: false }));
    setSync('off');
  }, []);

  /** Replaces everything on this device with the copy in Google Drive. */
  const restoreFromDrive = useCallback(async (): Promise<string> => {
    const text = await drive.loadBackup();
    if (!text) return 'No backup found in Google Drive yet.';
    if (!applyBackup(text)) return 'That backup file was not recognised.';
    setSync('saved');
    return 'Restored from Google Drive.';
  }, [applyBackup]);

  /** Keeps this device's data and lets it replace the Google Drive backup. */
  const keepThisDevice = useCallback(() => {
    setState((s) => ({ ...s, backupChecked: true, rev: s.rev + 1 }));
  }, []);

  return {
    state,
    sync,
    syncError,
    lastChange,
    driveConfigured: drive.driveConfigured,
    addLine,
    changeQty,
    removePayment,
    clearSale,
    pay,
    toggleVoid,
    setFloat,
    setQuickItems,
    endDay,
    connectDrive,
    reconnectDrive: () => drive.signIn(false),
    disconnectDrive,
    restoreFromDrive,
    keepThisDevice,
    retrySync: flush,
  };
}

export type Till = ReturnType<typeof useTill>;
