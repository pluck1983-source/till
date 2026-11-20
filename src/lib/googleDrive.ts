/**
 * Google Drive storage for the till. Uses the same browser-only redirect
 * sign-in as the tax planner (no server, no popup, so it works from an
 * iPad/iPhone home-screen app), but with the drive.file scope: the till can
 * only see files it created itself, and those files are visible to you in a
 * "Till records" folder in your Drive.
 *
 * - Each closed day is saved as a Google Sheet ("Till 2026-11-20").
 * - Each device (till) keeps its own "Till backup - <name>.json" with its open
 *   day, history and quick items, so several tills can save at once and a
 *   replacement device can take over a till.
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'Till records';
const TOKEN_KEY = 'till-gdrive-token';
const FOLDER_KEY = 'till-gdrive-folder';
const STATE_KEY = 'till-gdrive-oauth-state';
const SILENT_TRIED_KEY = 'till-gdrive-silent-tried';

export class AuthRequiredError extends Error {
  constructor() {
    super('Google sign-in required');
    this.name = 'AuthRequiredError';
  }
}

interface StoredToken {
  token: string;
  expiresAt: number;
}

export const driveConfigured = Boolean(CLIENT_ID);

function redirectUri(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}

function readToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredToken;
    return parsed.expiresAt - 60_000 > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

function writeToken(token: StoredToken | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore - storage blocked
  }
}

export function hasToken(): boolean {
  return readToken() !== null;
}

/** Picks up the token Google appends to the URL after sign-in. Runs on module load. */
function consumeRedirectResult() {
  if (!window.location.hash.includes('state=')) return;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const expected = sessionStorage.getItem(STATE_KEY);
  if (!expected || params.get('state') !== expected) return;
  sessionStorage.removeItem(STATE_KEY);
  const token = params.get('access_token');
  if (token) {
    writeToken({ token, expiresAt: Date.now() + Number(params.get('expires_in') ?? 3600) * 1000 });
    sessionStorage.removeItem(SILENT_TRIED_KEY);
  }
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

consumeRedirectResult();

/** Sends the page to Google to sign in. Everything is already saved locally, so nothing is lost. */
export function signIn(silent = false) {
  if (!CLIENT_ID) return;
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);
  if (silent) sessionStorage.setItem(SILENT_TRIED_KEY, '1');
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPE,
    state,
    include_granted_scopes: 'true',
    prompt: silent ? 'none' : 'select_account',
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

/** One silent sign-in attempt per browser session; false if already tried. */
export function trySilentSignIn(): boolean {
  if (!CLIENT_ID || !navigator.onLine || sessionStorage.getItem(SILENT_TRIED_KEY)) return false;
  signIn(true);
  return true;
}

export async function signOut() {
  const stored = readToken();
  writeToken(null);
  try {
    localStorage.removeItem(FOLDER_KEY);
  } catch {
    // ignore
  }
  if (stored) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(stored.token)}`, {
      method: 'POST',
    }).catch(() => {});
  }
}

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const stored = readToken();
  if (!stored) throw new AuthRequiredError();
  const response = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${stored.token}` },
  });
  if (response.status === 401) {
    writeToken(null);
    throw new AuthRequiredError();
  }
  if (!response.ok) throw new Error(`Google Drive request failed (${response.status})`);
  return response;
}

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

async function findFile(name: string, extraQ = ''): Promise<string | null> {
  const q = `name = '${name.replace(/'/g, "\\'")}' and trashed = false${extraQ}`;
  const res = await driveFetch(`${API}?${new URLSearchParams({ q, fields: 'files(id)', spaces: 'drive' })}`);
  const body = (await res.json()) as { files: { id: string }[] };
  return body.files[0]?.id ?? null;
}

async function folderId(): Promise<string> {
  const cached = localStorage.getItem(FOLDER_KEY);
  if (cached) return cached;
  let id = await findFile(FOLDER_NAME, " and mimeType = 'application/vnd.google-apps.folder'");
  if (!id) {
    const res = await driveFetch(`${API}?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
    });
    id = ((await res.json()) as { id: string }).id;
  }
  localStorage.setItem(FOLDER_KEY, id);
  return id;
}

async function multipartCreate(metadata: object, content: string, contentType: string) {
  const boundary = `till${Date.now()}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n${content}\r\n--${boundary}--`;
  await driveFetch(`${UPLOAD}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}

/** Saves a closed day's CSV as a Google Sheet in the Till records folder. */
export async function saveDaySheet(name: string, csv: string) {
  const parent = await folderId();
  await multipartCreate(
    { name, parents: [parent], mimeType: 'application/vnd.google-apps.spreadsheet' },
    csv,
    'text/csv',
  );
}

export interface TillBackupFile {
  id: string;
  name: string;
  modifiedTime: string;
  tillId: string;
}

/**
 * Each device keeps its own backup file, tagged with its till ID, so several
 * tills can save at the same time without overwriting each other.
 */
export async function saveBackup(tillId: string, tillName: string, json: string) {
  const parent = await folderId();
  const name = `Till backup - ${tillName}.json`;
  const q = `appProperties has { key='tillId' and value='${tillId}' } and trashed = false`;
  const res = await driveFetch(`${API}?${new URLSearchParams({ q, fields: 'files(id,name)', spaces: 'drive' })}`);
  const existing = ((await res.json()) as { files: { id: string; name: string }[] }).files[0];
  if (existing) {
    const boundary = `till${Date.now()}`;
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name })}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`;
    await driveFetch(`${UPLOAD}/${existing.id}?uploadType=multipart`, {
      method: 'PATCH',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
  } else {
    await multipartCreate(
      { name, parents: [parent], mimeType: 'application/json', appProperties: { tillId, kind: 'till-backup' } },
      json,
      'application/json',
    );
  }
}

/** Every till's backup file, newest first. */
export async function listBackups(): Promise<TillBackupFile[]> {
  const q = `appProperties has { key='kind' and value='till-backup' } and trashed = false`;
  const res = await driveFetch(
    `${API}?${new URLSearchParams({ q, fields: 'files(id,name,modifiedTime,appProperties)', spaces: 'drive', orderBy: 'modifiedTime desc' })}`,
  );
  const body = (await res.json()) as {
    files: { id: string; name: string; modifiedTime: string; appProperties?: { tillId?: string } }[];
  };
  return body.files
    .filter((f) => f.appProperties?.tillId)
    .map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, tillId: f.appProperties!.tillId! }));
}

export async function loadFile(id: string): Promise<string> {
  const res = await driveFetch(`${API}/${id}?alt=media`);
  return res.text();
}
