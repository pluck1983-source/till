import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyCard,
  applyCardFeeRate,
  applyCash,
  dayToCsv,
  localDate,
  newId,
  remaining,
  tradingDate,
  type CardFeeRate,
  type ClosedDay,
  type Payment,
  type QuickItem,
  type SaleLine,
} from './model';
import {
  closedDays,
  emptyShared,
  fingerprint,
  fromLegacy,
  mergeShared,
  normalize,
  openDay,
  type DayRecord,
  type SharedData,
} from './shared';
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

/** Everything this device stores. Only `shared` is synced; the rest belongs to this device. */
interface DeviceState {
  shared: SharedData;
  /** The sale being rung up on this device - each cashier has their own */
  current: CurrentSale;
  /** Closed days waiting to be saved to Google Drive as Sheets */
  outbox: OutboxItem[];
  driveLinked: boolean;
  /** Random ID given to this device the first time it links to Google Drive; stamped on its sales */
  deviceId: string | null;
  /** Cashier name shown on this device's sales, e.g. "Sam" or "iPad" */
  deviceName: string;
  sharedFileId: string | null;
  /** Bumped on every local change; syncedRev is the last one that reached Google Drive */
  rev: number;
  syncedRev: number;
  lastSyncedAt: string | null;
}

export type SyncStatus = 'off' | 'saved' | 'saving' | 'reconnect' | 'error';

const KEY = 'till-state-v2';
const LEGACY_KEY = 'till-state-v1';
const POLL_MS = 15_000;
const PUSH_DELAY_MS = 1500;

const emptySale = (): CurrentSale => ({ lines: [], payments: [] });

function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  return 'Till';
}

function initial(): DeviceState {
  return {
    shared: emptyShared(),
    current: emptySale(),
    outbox: [],
    driveLinked: false,
    deviceId: null,
    deviceName: defaultDeviceName(),
    sharedFileId: null,
    rev: 0,
    syncedRev: 0,
    lastSyncedAt: null,
  };
}

function load(): DeviceState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...initial(), ...(JSON.parse(raw) as DeviceState) };
    // Carry over data from the earlier one-device version.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy);
      return {
        ...initial(),
        shared: fromLegacy(old),
        current: old.current ?? emptySale(),
        outbox: old.outbox ?? [],
        driveLinked: Boolean(old.driveLinked),
        deviceName: old.tillName ?? defaultDeviceName(),
        rev: 1,
      };
    }
  } catch {
    // fall through to a fresh till
  }
  return initial();
}

function parseShared(text: string): SharedData | null {
  try {
    const data = JSON.parse(text) as SharedData;
    return data.app === 'till' && data.version === 3 && data.days ? normalize(data) : null;
  } catch {
    return null;
  }
}

export function useTill() {
  const [store, setStore] = useState<DeviceState>(load);
  const [sync, setSync] = useState<SyncStatus>(() => (store.driveLinked ? 'saving' : 'off'));
  const [syncError, setSyncError] = useState<string | null>(null);
  /** Change due from the last completed sale - shown until the next sale starts */
  const [lastChange, setLastChange] = useState<{ change: number; total: number } | null>(null);

  const storeRef = useRef(store);
  storeRef.current = store;

  const resetting = useRef(false);

  useEffect(() => {
    if (resetting.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      // Storage full or blocked - the till keeps working in memory.
    }
  }, [store]);

  /** Applies a local change and marks it for syncing. */
  const update = useCallback((fn: (s: DeviceState) => DeviceState) => {
    setStore((s) => {
      const next = fn(s);
      return next === s ? s : { ...next, rev: s.rev + 1 };
    });
  }, []);

  /** Changes the open day in the shared data. */
  const updateDay = useCallback(
    (fn: (d: DayRecord) => DayRecord) =>
      update((s) => {
        const day = openDay(s.shared);
        return { ...s, shared: { ...s.shared, days: { ...s.shared.days, [day.id]: fn(day) } } };
      }),
    [update],
  );

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
      const s = storeRef.current;
      const owed = remaining(s.current.lines, s.current.payments);
      if (owed <= 0 || s.current.lines.length === 0) return;
      let payment: Payment;
      let change = 0;
      if (method === 'cash') {
        ({ payment, change } = applyCash(owed, amount && amount > 0 ? amount : owed));
      } else {
        payment = applyCard(owed, amount, s.shared.cardFeeRate);
      }
      const payments = [...s.current.payments, payment];
      if (remaining(s.current.lines, payments) > 0) {
        update((st) => ({ ...st, current: { ...st.current, payments } }));
        return;
      }
      const total = s.current.lines.reduce((sum, l) => sum + l.price * l.qty, 0);
      setLastChange({ change, total });
      const now = new Date().toISOString();
      update((st) => {
        const day = openDay(st.shared);
        const sale = {
          id: newId(),
          lines: st.current.lines,
          payments,
          completedAt: now,
          updatedAt: now,
          cashier: st.deviceName,
          ...(st.deviceId ? { deviceId: st.deviceId } : {}),
        };
        return {
          ...st,
          shared: { ...st.shared, days: { ...st.shared.days, [day.id]: { ...day, sales: [...day.sales, sale] } } },
          current: emptySale(),
        };
      });
    },
    [update],
  );

  /** Voids (or restores) a sale on the open day. */
  const toggleVoid = useCallback(
    (saleId: string) => {
      const now = new Date().toISOString();
      updateDay((day) => ({
        ...day,
        sales: day.sales.map((sale) =>
          sale.id !== saleId
            ? sale
            : sale.voidedAt
              ? { ...sale, voidedAt: undefined, updatedAt: now }
              : { ...sale, voidedAt: now, updatedAt: now },
        ),
      }));
    },
    [updateDay],
  );

  const setFloat = useCallback(
    (float: number) =>
      updateDay((day) => ({ ...day, float, floatSet: true, floatUpdatedAt: new Date().toISOString() })),
    [updateDay],
  );

  const setDeviceName = useCallback(
    (name: string) => update((s) => ({ ...s, deviceName: name.trim() || defaultDeviceName() })),
    [update],
  );

  /** Re-works every card fee on today's sales at the current rate (none set = no fees). */
  const updateTodaysCardFees = useCallback(() => {
    const rate = storeRef.current.shared.cardFeeRate ?? { percent: 0, fixed: 0 };
    const now = new Date().toISOString();
    updateDay((day) => ({ ...day, sales: applyCardFeeRate(day.sales, rate, now) }));
  }, [updateDay]);

  const setCardFeeRate = useCallback(
    (rate: CardFeeRate | null) =>
      update((s) => {
        const shared = { ...s.shared, cardFeeRateUpdatedAt: new Date().toISOString() };
        if (rate) shared.cardFeeRate = rate;
        else delete shared.cardFeeRate;
        return { ...s, shared };
      }),
    [update],
  );

  const setQuickItems = useCallback(
    (quickItems: QuickItem[]) =>
      update((s) => ({ ...s, shared: { ...s.shared, quickItems, quickItemsUpdatedAt: new Date().toISOString() } })),
    [update],
  );

  /** Closes the day for every device, queues its Sheet, and opens the next day. */
  const endDay = useCallback(
    (countedCash?: number): ClosedDay => {
      const s = storeRef.current;
      const day = openDay(s.shared);
      const closedAt = new Date().toISOString();
      const closedRecord: DayRecord = {
        ...day,
        closedAt,
        closedBy: s.deviceName,
        ...(countedCash !== undefined ? { countedCash } : {}),
      };
      const shared = normalize({ ...s.shared, days: { ...s.shared.days, [day.id]: closedRecord } });
      const closed = closedDays(shared).find((d) => d.id === day.id)!;
      setLastChange(null);
      update((st) => ({
        ...st,
        shared: mergeShared(st.shared, shared),
        outbox: st.driveLinked
          ? [...st.outbox, { id: closed.id, name: `Till ${localDate(tradingDate(closed))}`, csv: dayToCsv(closed) }]
          : st.outbox,
        current: emptySale(),
      }));
      return closed;
    },
    [update],
  );

  // ---- Google Drive ----------------------------------------------------

  const running = useRef(false);

  /**
   * Saves queued day Sheets, then merges this device's data with the shared
   * file both ways. `pull` also runs when nothing changed here, to pick up the
   * other cashiers' sales.
   */
  const flush = useCallback(async (pull = false) => {
    const s = storeRef.current;
    if (!s.driveLinked || running.current) return;
    const dirty = s.outbox.length > 0 || s.rev !== s.syncedRev;
    if (!drive.hasToken()) {
      setSync(dirty ? 'reconnect' : 'saved');
      return;
    }
    if (!dirty && !pull) return;
    running.current = true;
    if (dirty) setSync('saving');
    try {
      for (const item of s.outbox) {
        await drive.saveDaySheet(item.name, item.csv);
        setStore((st) => ({ ...st, outbox: st.outbox.filter((o) => o.id !== item.id) }));
      }

      const startRev = storeRef.current.rev;
      let local = storeRef.current.shared;
      let fileId = storeRef.current.sharedFileId;
      let remote: SharedData | null = null;

      if (fileId) {
        try {
          remote = parseShared(await drive.loadFile(fileId));
        } catch (err) {
          if (err instanceof drive.AuthRequiredError) throw err;
          fileId = null; // deleted or unreadable - look it up again
        }
      }
      if (!fileId) {
        const files = await drive.listSharedFiles();
        if (files.length === 0) {
          fileId = await drive.createSharedFile(JSON.stringify(local));
          remote = local;
        } else {
          // Normally one file. If two devices created one at the same moment, fold them into the oldest.
          fileId = files[0].id;
          for (const f of files) {
            const data = parseShared(await drive.loadFile(f.id));
            if (data) remote = remote ? mergeShared(remote, data) : data;
          }
          for (const f of files.slice(1)) await drive.deleteFile(f.id).catch(() => {});
        }
      }

      const merged = remote ? mergeShared(local, remote) : local;
      if (!remote || fingerprint(merged) !== fingerprint(remote)) {
        await drive.updateSharedFile(fileId, JSON.stringify(merged));
      }
      local = merged;
      const now = new Date().toISOString();
      setStore((st) => ({
        ...st,
        // Merge again in case a sale was rung up while this sync was running.
        shared: mergeShared(st.shared, local),
        sharedFileId: fileId,
        syncedRev: Math.max(st.syncedRev, startRev),
        lastSyncedAt: now,
      }));
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

  // Push shortly after a change, so a burst of taps is one upload.
  useEffect(() => {
    if (!store.driveLinked || store.rev === store.syncedRev) return;
    const t = window.setTimeout(() => void flush(), PUSH_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [store.rev, store.syncedRev, store.outbox.length, store.driveLinked, flush]);

  // Pull the other cashiers' sales regularly while the till is on screen.
  useEffect(() => {
    if (!store.driveLinked) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void flush(true);
    };
    tick();
    const t = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('online', tick);
    };
  }, [store.driveLinked, flush]);

  // On open: a token that has lapsed gets one silent refresh, but only when no sale is half-rung.
  useEffect(() => {
    const s = storeRef.current;
    if (s.driveLinked && !drive.hasToken() && s.current.lines.length === 0) drive.trySilentSignIn();
  }, []);

  /** Links this device to Google Drive, giving it its device ID the first time. */
  const connectDrive = useCallback(() => {
    const s = storeRef.current;
    const deviceId = s.deviceId ?? newId();
    // Sales rung up before this device was linked get its new ID too.
    const days: Record<string, DayRecord> = {};
    for (const [id, d] of Object.entries(s.shared.days)) {
      days[id] = { ...d, sales: d.sales.map((sale) => (sale.deviceId ? sale : { ...sale, deviceId })) };
    }
    const next: DeviceState = {
      ...s,
      deviceId,
      shared: { ...s.shared, days },
      driveLinked: true,
      rev: s.rev + 1,
    };
    // Save before leaving: the sign-in navigates away and back.
    localStorage.setItem(KEY, JSON.stringify(next));
    drive.signIn(false);
  }, []);

  const disconnectDrive = useCallback(async () => {
    await drive.signOut();
    setStore((s) => ({ ...s, driveLinked: false, outbox: [], sharedFileId: null }));
    setSync('off');
  }, []);

  /**
   * Wipes the till on this device only - sales, history, quick items, float,
   * cashier name - and reloads it empty. Only touches the till's own storage
   * keys, never other apps on the same site.
   */
  const resetTill = useCallback(() => {
    resetting.current = true;
    for (const store of [localStorage, sessionStorage]) {
      for (const k of Object.keys(store)) if (k.startsWith('till-')) store.removeItem(k);
    }
    window.location.reload();
  }, []);

  /** What the screens read: today's open day and history, derived from the shared data. */
  const state = useMemo(
    () => ({
      day: openDay(store.shared),
      history: closedDays(store.shared),
      quickItems: store.shared.quickItems,
      cardFeeRate: store.shared.cardFeeRate,
      current: store.current,
      outbox: store.outbox,
      driveLinked: store.driveLinked,
      deviceId: store.deviceId,
      deviceName: store.deviceName,
      lastSyncedAt: store.lastSyncedAt,
    }),
    [store],
  );

  return {
    state,
    sync,
    syncError,
    lastChange,
    dismissChange: () => setLastChange(null),
    driveConfigured: drive.driveConfigured,
    addLine,
    changeQty,
    removePayment,
    clearSale,
    pay,
    toggleVoid,
    setFloat,
    setDeviceName,
    setQuickItems,
    setCardFeeRate,
    updateTodaysCardFees,
    endDay,
    connectDrive,
    reconnectDrive: () => drive.signIn(false),
    disconnectDrive,
    syncNow: () => flush(true),
    resetTill,
  };
}

export type Till = ReturnType<typeof useTill>;
