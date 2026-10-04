// Talks to Supabase (or the local stand-in) over Supabase's standard HTTP API: the Auth API for accounts
// and sessions, and database functions through /rest/v1/rpc. No SDK is needed and the same requests work
// against both. Sessions refresh themselves shortly before they expire.
const cfg = window.NUVORA_CONFIG ?? {};
const KEY = 'nuvora.session';

export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

export const config = cfg;
export const isConfigured = () => Boolean(cfg.supabaseUrl && cfg.anonKey) && !/YOUR[-_]/.test(`${cfg.supabaseUrl}${cfg.anonKey}`);

// ---------------------------------------------------------------- session storage
// "Keep me signed in" (off unless ticked) keeps the session in localStorage; otherwise it lives only in this tab
// (sessionStorage) and ends when the tab closes.
const storage = (persist) => { try { return persist ? window.localStorage : window.sessionStorage; } catch { return null; } };
const listeners = new Set();
let session = null;
let persist = true;
for (const keep of [true, false]) {
  try {
    const v = storage(keep)?.getItem(KEY);
    if (v) { session = JSON.parse(v); persist = keep; break; }
  } catch { /* unreadable storage: start signed out */ }
}

function save(next, keep = persist) {
  session = next;
  persist = keep;
  for (const k of [true, false]) { try { storage(k)?.removeItem(KEY); } catch { /* ignore */ } }
  if (next) { try { storage(keep)?.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ } }
  listeners.forEach((fn) => fn(session));
}
// Another tab signed in, refreshed or signed out: follow it.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || e.storageArea !== storage(true)) return;
  try { session = e.newValue ? JSON.parse(e.newValue) : null; } catch { session = null; }
  listeners.forEach((fn) => fn(session));
});
export const onAuthChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// ---------------------------------------------------------------- HTTP
const messageOf = (d) => (d && (d.msg ?? d.message ?? d.error_description ?? d.error)) || null;

// `file` sends raw bytes (a File or Blob) with its own content type instead of JSON.
async function request(path, { method = 'POST', body, file, token, keepalive = false } = {}) {
  const headers = { apikey: cfg.anonKey, Authorization: `Bearer ${token ?? cfg.anonKey}` };
  if (file) headers['Content-Type'] = file.type;
  else if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(cfg.supabaseUrl + path, { method, headers, keepalive, body: file ?? (body === undefined ? undefined : JSON.stringify(body)) });
  } catch {
    throw new ApiError('Can’t reach Nuvora right now. Check your connection and try again.', 0, 'network');
  }
  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) throw new ApiError(messageOf(data) ?? `Something went wrong (${res.status}).`, res.status, data?.error_code ?? data?.code);
  return data;
}

let refreshing = null;
async function accessToken() {
  if (!session) return null;
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
  refreshing ??= request('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: session.refresh_token } })
    .then((s) => save({ ...s, user: s.user ?? session?.user ?? null }), () => save(null))
    .finally(() => { refreshing = null; });
  await refreshing;
  return session?.access_token ?? null;
}

// ---------------------------------------------------------------- auth
export const auth = {
  get session() { return session; },
  get user() { return session?.user ?? null; },

  async signIn(email, password, remember = false) {
    const s = await request('/auth/v1/token?grant_type=password', { body: { email: email.trim(), password } });
    save(s, remember);
    return s.user;
  },

  /** Returns { signedIn } — false when the project requires confirming the email first. */
  async signUp(email, password, fullName, remember = false) {
    const r = await request('/auth/v1/signup', { body: { email: email.trim(), password, data: { full_name: fullName.trim() } } });
    if (r?.access_token) save(r, remember);
    return { signedIn: Boolean(r?.access_token) };
  },

  async signOut() {
    const t = session?.access_token;
    save(null);
    if (t) { try { await request('/auth/v1/logout', { token: t }); } catch { /* already signed out locally */ } }
  },

  /** Sends a reset link that returns to this page. Always succeeds, so it never reveals which emails exist. */
  async sendPasswordReset(email) {
    await request(`/auth/v1/recover?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`, { body: { email: email.trim() } });
  },

  async updatePassword(password) {
    return request('/auth/v1/user', { method: 'PUT', body: { password }, token: await accessToken() });
  },

  async loadUser() {
    const user = await request('/auth/v1/user', { method: 'GET', token: await accessToken() });
    if (session) save({ ...session, user });
    return user;
  },

  /** Handles the return from a password-reset email: #access_token=…&type=recovery, or #error=…. */
  consumeRedirect() {
    const p = new URLSearchParams(location.hash.slice(1));
    if (!p.has('access_token') && !p.has('error')) return null;
    history.replaceState(null, '', location.pathname + location.search);   // take the tokens out of the address bar
    if (p.has('error')) return { error: p.get('error_description') || 'This link is invalid or has expired.' };
    const expiresIn = Number(p.get('expires_in')) || 3600;
    save({
      access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), token_type: 'bearer',
      expires_in: expiresIn, expires_at: Number(p.get('expires_at')) || Math.floor(Date.now() / 1000) + expiresIn, user: null,
    }, false);
    return { type: p.get('type') };
  },
};

// ---------------------------------------------------------------- database functions
export async function rpc(fn, args = {}) {
  const hadSession = Boolean(session);
  try {
    return await request(`/rest/v1/rpc/${encodeURIComponent(fn)}`, { body: args, token: await accessToken() });
  } catch (e) {
    if (e.status === 401 && hadSession) save(null);   // session no longer valid: back to sign-in
    throw e;
  }
}

// ---------------------------------------------------------------- PDF downloads
// Course PDFs live in a private storage bucket. Storage checks the caller's enrollment and returns a link
// that works for 60 seconds; the browser then downloads the file. Videos never go through this path.
const FILES_BUCKET = 'course-files';

export async function downloadPdf(path, filename) {
  const hadSession = Boolean(session);
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  let signed;
  try {
    signed = await request(`/storage/v1/object/sign/${FILES_BUCKET}/${encoded}`, { body: { expiresIn: 60 }, token: await accessToken() });
  } catch (e) {
    if (e.status === 401 && hadSession) save(null);
    if (e.status === 400 || e.status === 404) throw new ApiError('This file isn’t available to you, or hasn’t been uploaded yet.', 404, 'not_found');
    throw e;
  }
  const a = document.createElement('a');
  a.href = `${cfg.supabaseUrl}/storage/v1${signed.signedURL}&download=${encodeURIComponent(filename)}`;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
}

// ---------------------------------------------------------------- PDF uploads (admins only)
// Storage accepts a file only from an admin, only as a PDF of at most 50 MB inside a program's folder, and never
// replaces an existing file. The same checks run here first so the admin gets a quick, clear message.
export const MAX_PDF_BYTES = 52_428_800;

/** Returns a message explaining why this file can't be uploaded, or null when it looks fine. */
export function pdfProblem(file) {
  if (!file) return 'Choose a PDF file first.';
  if (file.type !== 'application/pdf' || !/.pdf$/i.test(file.name)) return `“${file.name}” isn’t a PDF. Only PDF files can be uploaded.`;
  if (file.size > MAX_PDF_BYTES) return 'This PDF is larger than 50 MB. Make it smaller and try again.';
  if (file.size === 0) return 'This file is empty.';
  return null;
}

const STORAGE_MESSAGES = {
  415: 'That file isn’t a PDF. Only PDF files can be uploaded.',
  413: 'This PDF is larger than 50 MB. Make it smaller and try again.',
  409: 'A file with this name already exists. Rename the file and upload it again.',
  403: 'Only admins can upload course files, into a program’s folder.',
};

export async function uploadPdf(path, file) {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  try {
    return await request(`/storage/v1/object/${FILES_BUCKET}/${encoded}`, { file, token: await accessToken() });
  } catch (e) {
    if (STORAGE_MESSAGES[e.status]) throw new ApiError(STORAGE_MESSAGES[e.status], e.status, e.code);
    throw e;
  }
}

/** Deletes files no lesson or project uses any more. Returns the paths that were actually deleted. */
export async function removeFiles(paths) {
  const r = await request(`/storage/v1/object/${FILES_BUCKET}`, { method: 'DELETE', body: { prefixes: paths }, token: await accessToken() });
  return (r ?? []).map((o) => o.name);
}

/** Fire-and-forget call that survives the page closing (used to save the last few seconds of watching). */
export function rpcOnUnload(fn, args = {}) {
  if (!session || session.expires_at <= Date.now() / 1000) return;
  request(`/rest/v1/rpc/${encodeURIComponent(fn)}`, { body: args, token: session.access_token, keepalive: true }).catch(() => {});
}
