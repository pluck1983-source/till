# Till

A simple web till for iPad (iPhone as backup). Live at
https://pluck1983-source.github.io/till/ - open it in Safari and use
**Share → Add to Home Screen** to run it full-screen; it works offline.

## Using it

- Key in a price (or tap a quick item) and tap **Add item**. The subtotal is
  always on screen, and you can keep adding items after a part-payment.
- **Cash** takes the keyed-in amount as cash handed over and shows the change
  (or the exact amount if nothing is keyed in). The £ buttons are one-tap notes.
- **Card** takes what's left, or a keyed-in part for split payments.
- Today's total, cash and card are always in the header. **Today** lists every
  transaction (with void/restore) and has **End of day**: opening float,
  optional cash count (over/short), then **Save day & reset**.
- **History** keeps every closed day, with a CSV download.
- **Settings** sets up quick items and Google Drive.

## Storage

Everything is saved on the device as you go - a sale never waits for the
internet. With **Settings → Connect Google account**, each closed day is saved
as a Google Sheet (`Till 2026-11-20 - iPad`) in a `Till records` folder in your
Drive. The till uses the `drive.file` scope, so it can only see files it created.

### Two (or more) cashiers, one till

Connect every cashier's device to the same Google account and set a cashier
name in **Settings → This device**. When a device first links to Drive it gets
a random device ID, and every sale it rings up carries that ID and the
cashier name.

All devices share one record, `Till data.json`: one float, one set of sales,
merged by each sale's random ID. Devices sync a moment after each sale and
every 15 seconds. Drive can't stop two devices saving at the same instant, so
the merge only ever adds sales (voids and float changes go by newest
timestamp) and each device re-merges what it holds on every sync. A sale lost
to a simultaneous save comes back on the next round.

**End of day** closes the day on every device. A sale rung up on another
device just after the close moves to the next day. **Today → By cashier**
shows each cashier's takings.

Google sign-in needs `VITE_GOOGLE_CLIENT_ID` in `.env` (an OAuth "Web
application" client with `https://pluck1983-source.github.io` as an authorised
JavaScript origin and `https://pluck1983-source.github.io/till/` as an
authorised redirect URI).

## Development

```bash
npm install
npm run dev
npm test
```
