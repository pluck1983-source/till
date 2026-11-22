# Till

iPad-first web till (React + Vite + TypeScript, PWA).

## Hosting and Google setup

- **Live:** https://pluck1983-source.github.io/till/ (GitHub Pages, deploys
  from `main` only).
- **Google account:** the Wardrobe to Wallet Google account.
- **Google Cloud project:** **Till** - project ID `till-515322`, number
  `863482483873`. Used only by this app.
- **OAuth client:** `863482483873-…`, in `.env` (`VITE_GOOGLE_CLIENT_ID`).
  Authorised origin `https://pluck1983-source.github.io`, redirect
  `https://pluck1983-source.github.io/till/`.
- **Scope:** `drive.file` (only files the till creates).
- **Data:** each device keeps its own copy in browser storage; with Google
  linked, everything syncs through `Till data.json` and closed days are saved
  as Sheets, all in a `Till records` folder in the Drive of the account the
  devices sign in with.

## Keep the app registry up to date

The owner keeps one summary of every app's hosting and Google setup in
`pluck1983-source/app-registry` (`APPS.md`). Whenever you change any of the
following in this repo, update **this file**, the README's Google section,
**and** `APPS.md` in that repo, in the same piece of work:

- the live web address / hosting
- the Google account, Google Cloud project, or OAuth client ID it signs in with
- the Google scopes it asks for
- where its data is stored (Drive folder, app-data folder, which account)

If `app-registry` isn't attached to the session, ask the owner to attach it
rather than skipping the update. Never write email addresses into these
files - the repos are public; describe accounts instead ("personal Gmail",
"Wardrobe to Wallet account").
