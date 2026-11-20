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
  sumTotals,
  totalsForDate,
  type DayTotals,
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
  /** Identifies this till's own backup file in Google Drive, so several tills can save at once */
  tillId: string;
  /** Shown on saved days and in the All tills total, e.g. "iPad" */
  tillName: string;
}

export type SyncStatus = 'off' | 'saved' | 'saving' | 'reconnect' | 'error';

export interface TillSummary {
  tillId: string;
  name: string;
  /** When its figures were last saved (now, for this device) */
  updatedAt: string;
  totals: DayTotals;
  /** Still trading (day not closed yet) */
  open: boolean;
  isThisDevice: boolean;
}

export interface OtherTill {
  fileId: string;
  tillId: string;
  name: string;
  modifiedTime: string;
}

const KEY = 'till-state-v1';
const MAX_HISTORY = 400;

const emptySale = (): CurrentSale => ({ lines: [], payments: [] });

function defaultTillName(): string {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  return 'Till';
}

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
    tillId: newId(),
    tillName: defaultTillName(),
  };
}

function load(): TillState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<TillState> & { backupChecked?: boolean };
      delete saved.backupChecked;
      return { ...initial(), ...saved } as TillState;
    }
  } catch {
    // fall through to a fresh till
  }
  return initial();
}

function backupPayload(s: TillState): string {
  const { day, current, history, quickItems, tillId, tillName } = s;
  return JSON.stringify({
    app: 'till',
    version: 2,
    savedAt: new Date().toISOString(),
    tillId,
    tillName,
    day,
    current,
    history,
    quickItems,
  });
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

  const setTillName = useCallback(
    (tillName: string) => update((s) => ({ ...s, tillName: tillName.trim() || defaultTillName() })),
    [update],
  );

  const setQuickItems = useCallback((quickItems: QuickItem[]) => update((s) => ({ ...s, quickItems })), [update]);

  /** Saves the day to history (and queues it for Google Drive), then starts a fresh day. */
  const endDay = useCallback(
    (countedCash?: number): ClosedDay => {
      const closed = closeDay(stateRef.current.day, countedCash, stateRef.current.tillName);
      setLastChange(null);
      update((s) => ({
        ...s,
        history: [closed, ...s.history].slice(0, MAX_HISTORY),
        outbox: s.driveLinked
          ? [
              ...s.outbox,
              { id: closed.id, name: `Till ${localDate(closed.openedAt)} - ${s.tillName}`, csv: dayToCsv(closed) },
            ]
          : s.outbox,
        day: newDay(),
        current: emptySale(),
      }));
      return closed;
    },
    [update],
  );

  // ---- Google Drive ----------------------------------------------------

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
      for (const item of s.outbox) {
        await drive.saveDaySheet(item.name, item.csv);
        setState((st) => ({ ...st, outbox: st.outbox.filter((o) => o.id !== item.id) }));
      }
      const current = stateRef.current;
      await drive.saveBackup(current.tillId, current.tillName, backupPayload(current));
      setState((st) => ({ ...st, backedUpRev: current.rev }));
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
  }, []);

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

  // A newly connected till with no quick items of its own borrows them from the most recently saved till.
  useEffect(() => {
    const s = stateRef.current;
    if (!s.driveLinked || !drive.hasToken() || s.quickItems.length > 0) return;
    void (async () => {
      try {
        const other = (await drive.listBackups()).find((f) => f.tillId !== s.tillId);
        if (!other) return;
        const data = JSON.parse(await drive.loadFile(other.id)) as { quickItems?: QuickItem[] };
        if (data.quickItems?.length && stateRef.current.quickItems.length === 0) {
          update((st) => ({ ...st, quickItems: data.quickItems! }));
        }
      } catch {
        // Nice to have - ignore failures.
      }
    })();
  }, [state.driveLinked, update]);

  const connectDrive = useCallback(() => {
    // Mark linked first: the sign-in navigates away and back.
    const next = { ...stateRef.current, driveLinked: true, rev: stateRef.current.rev + 1 };
    localStorage.setItem(KEY, JSON.stringify(next));
    drive.signIn(false);
  }, []);

  const disconnectDrive = useCallback(async () => {
    await drive.signOut();
    setState((s) => ({ ...s, driveLinked: false, outbox: [] }));
    setSync('off');
  }, []);

  /** The other tills saved in Google Drive (not this one). */
  const listOtherTills = useCallback(async (): Promise<OtherTill[]> => {
    const files = await drive.listBackups();
    return files
      .filter((f) => f.tillId !== stateRef.current.tillId)
      .map((f) => ({
        fileId: f.id,
        tillId: f.tillId,
        name: f.name.replace(/^Till backup - /, '').replace(/\.json$/, ''),
        modifiedTime: f.modifiedTime,
      }));
  }, []);

  /**
   * Makes this device carry on as another till (e.g. the iPhone taking over
   * when the iPad has died): copies its sales, history and quick items and
   * takes over its backup file. This device's own data is replaced.
   */
  const takeOverTill = useCallback(async (other: OtherTill): Promise<string> => {
    const data = JSON.parse(await drive.loadFile(other.fileId)) as Partial<TillState> & { app?: string };
    if (data.app !== 'till' || !data.day) return 'That backup file was not recognised.';
    setLastChange(null);
    setState((s) => {
      const rev = s.rev + 1;
      const next: TillState = {
        ...s,
        day: data.day!,
        current: data.current ?? emptySale(),
        history: data.history ?? [],
        quickItems: data.quickItems ?? s.quickItems,
        tillId: other.tillId,
        tillName: data.tillName ?? other.name,
        rev,
        backedUpRev: rev,
      };
      stateRef.current = next;
      return next;
    });
    setSync('saved');
    return `This device is now "${data.tillName ?? other.name}".`;
  }, []);

  /** Today's figures for every till: this one live, the others as last saved to Google Drive. */
  const allTillsToday = useCallback(async (): Promise<{ tills: TillSummary[]; combined: DayTotals }> => {
    const today = localDate(new Date().toISOString());
    const me = stateRef.current;
    const mine = totalsForDate(me.day, me.history, today);
    const tills: TillSummary[] = [
      {
        tillId: me.tillId,
        name: me.tillName,
        updatedAt: new Date().toISOString(),
        ...mine,
        isThisDevice: true,
      },
    ];
    for (const f of await drive.listBackups()) {
      if (f.tillId === me.tillId) continue;
      try {
        const data = JSON.parse(await drive.loadFile(f.id)) as Partial<TillState> & { savedAt?: string };
        if (!data.day) continue;
        const t = totalsForDate(data.day, data.history ?? [], today);
        if (t.totals.count === 0 && !t.open && t.totals.expectedDrawer === 0) continue; // not used today
        tills.push({
          tillId: f.tillId,
          name: data.tillName ?? f.name,
          updatedAt: data.savedAt ?? f.modifiedTime,
          ...t,
          isThisDevice: false,
        });
      } catch {
        // Skip an unreadable file rather than failing the whole total.
      }
    }
    return { tills, combined: sumTotals(tills.map((t) => t.totals)) };
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
    setTillName,
    listOtherTills,
    takeOverTill,
    allTillsToday,
    retrySync: flush,
  };
}

export type Till = ReturnType<typeof useTill>;
