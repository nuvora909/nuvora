// Local development server for Nuvora.
// Serves the public site at / (built from web/ into dist/ on start) and the portal at /portal/, and stands in for
// Supabase's Auth API (/auth/v1),
// REST API (/rest/v1/rpc) and Storage (/storage/v1: admin PDF uploads, signed downloads) on top of an in-memory PostgreSQL
// loaded with the real migrations.
// The portal speaks the same HTTP protocol to this server as it will to Supabase in production.
//
//   npm run dev        then open http://127.0.0.1:5173/portal/
import http from 'node:http';
import { watch as watchFiles } from 'node:fs';
import { execFile } from 'node:child_process';
import { readFile, stat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDb, closeDb, runAs } from './localdb.mjs';
import { signJwt, verifyJwt, hashPassword, checkPassword, randomToken } from './auth.mjs';
import { loadDemo } from './demo.mjs';
import { placeholderPdf } from './pdf.mjs';
import { buildSite, DIST } from '../scripts/build-site.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MEDIA_ROOTS = ['img', 'video', 'fonts'].map((m) => [`/${m}/`, resolve(ROOT, 'web/static', m)]);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
};
const NAME = /^[a-z_][a-z0-9_]{0,62}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY = 64 * 1024;
const MAX_UPLOAD = 50 * 1024 * 1024;                               // the course-files bucket's limit
const RECOVERY_TTL = 3600;
const MIN_PASSWORD = 8;

class HttpError extends Error {
  constructor(status, body) { super(body?.msg ?? body?.message ?? 'error'); this.status = status; this.body = body; }
}
const authError = (status, error_code, msg) => new HttpError(status, { code: status, error_code, msg });
const restError = (status, code, message, details = null, hint = null) => new HttpError(status, { code, message, details, hint });

export async function startServer({ port = 5173, host = '127.0.0.1', testApi = false, demo = true, accessTtl = 3600, quiet = false, build = true, watch = false,
                                    portalDir = resolve(ROOT, 'portal') } = {}) {
  // Each server builds the website into its own temporary folder, so a preview server and a test server can run
  // side by side. Photos, video and fonts are served straight from web/static.
  const siteDir = build ? await mkdtemp(join(tmpdir(), 'nuvora-site-')) : DIST;
  if (build) await buildSite({ outDir: siteDir, quiet: true, media: false });
  // portalDir: another copy of portal/ (tests/sabotage.mjs serves a deliberately broken copy this way).
  const STATIC_ROOTS = [['/portal/', resolve(portalDir)], ...MEDIA_ROOTS, ['/', siteDir]];
  // --watch: rebuild the website in a fresh process (so edited modules are re-read) when web/ or the catalog changes.
  const watchers = [];
  if (build && watch) {
    let timer = null;
    const rebuild = () => execFile(process.execPath, [resolve(ROOT, 'scripts/build-site.mjs'), '--out', siteDir, '--no-media', '--quiet'],
      (err, _out, stderr) => (err ? console.error(stderr || err) : log('Website rebuilt')));
    const onChange = () => { clearTimeout(timer); timer = setTimeout(rebuild, 150); };
    watchers.push(watchFiles(resolve(ROOT, 'web'), { recursive: true }, onChange), watchFiles(resolve(ROOT, 'scripts/catalog.mjs'), onChange));
  }
  const secret = randomBytes(32).toString('hex');
  const issued = Math.floor(Date.now() / 1000);
  const tenYears = 10 * 365 * 86400;
  const anonKey = signJwt({ iss: 'nuvora-local', role: 'anon', iat: issued, exp: issued + tenYears }, secret);
  const serviceKey = signJwt({ iss: 'nuvora-local', role: 'service_role', iat: issued, exp: issued + tenYears }, secret);
  const state = { db: null, refresh: new Map(), recovery: new Map(), outbox: [], demo: null, files: new Map() };
  const log = quiet ? () => {} : (...a) => console.log(...a);
  let dummyHash; // compared against when an email is unknown, so timing does not reveal which emails exist

  async function reset() {
    const old = state.db;
    state.db = await createDb();
    state.refresh.clear();
    state.recovery.clear();
    state.outbox.length = 0;
    state.files.clear();
    state.demo = demo ? await loadDemo(state.db) : null;
    if (old) await closeDb(old);
  }
  await reset();
  dummyHash = await hashPassword(randomToken());

  // ---------------------------------------------------------------- helpers
  const send = (res, status, body, headers = {}) => {
    const json = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(json);
  };

  async function readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) throw restError(413, 'PGRST413', 'Request body too large');
      chunks.push(c);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text) return {};
    try { return JSON.parse(text); } catch { throw restError(400, 'PGRST102', 'Invalid JSON in request body'); }
  }

  // Requests must carry a valid API key (as with Supabase); the bearer token, if any, decides the role.
  function claimsFor(req, { authApi = false } = {}) {
    const key = req.headers.apikey;
    if (!key) throw authApi ? authError(401, 'no_api_key', 'No API key found in request') : restError(401, 'PGRST000', 'No API key found in request');
    const keyClaims = verifyJwt(key, secret);
    if (!keyClaims || !['anon', 'service_role'].includes(keyClaims.role)) {
      throw authApi ? authError(401, 'bad_api_key', 'Invalid API key') : restError(401, 'PGRST000', 'Invalid API key');
    }
    const auth = req.headers.authorization;
    if (!auth) return keyClaims;
    const m = /^Bearer (\S+)$/.exec(auth);
    const claims = m && verifyJwt(m[1], secret);
    if (!claims || !['anon', 'authenticated', 'service_role'].includes(claims.role)) {
      const expired = m && verifyJwt(m[1], secret, 0) !== null;
      throw authApi ? authError(401, 'bad_jwt', expired ? 'JWT expired' : 'Invalid JWT')
                    : restError(401, expired ? 'PGRST301' : 'PGRST300', expired ? 'JWT expired' : 'Invalid JWT');
    }
    return claims;
  }

  const userRow = async (where, value) =>
    (await state.db.query(`select id, email, encrypted_password, raw_user_meta_data, email_confirmed_at, last_sign_in_at, created_at, updated_at
                           from auth.users where ${where} = $1`, [value])).rows[0];

  const publicUser = (u) => ({
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
    email_confirmed_at: u.email_confirmed_at, last_sign_in_at: u.last_sign_in_at,
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: u.raw_user_meta_data ?? {},
    created_at: u.created_at, updated_at: u.updated_at,
  });

  function newSession(u) {
    const now = Math.floor(Date.now() / 1000);
    const session_id = randomUUID();
    const access_token = signJwt({ iss: 'nuvora-local', sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated',
                                   session_id, iat: now, exp: now + accessTtl }, secret);
    const refresh_token = randomToken();
    state.refresh.set(refresh_token, { userId: u.id, session_id });
    return { access_token, token_type: 'bearer', expires_in: accessTtl, expires_at: now + accessTtl, refresh_token, user: publicUser(u) };
  }

  async function currentUser(req) {
    const claims = claimsFor(req, { authApi: true });
    if (claims.role !== 'authenticated' || !claims.sub) throw authError(401, 'no_authorization', 'This endpoint requires a signed-in user');
    const u = await userRow('id', claims.sub);
    if (!u) throw authError(403, 'user_not_found', 'User from sub claim in JWT does not exist');
    return u;
  }

  const okRedirect = (origin, target) => {
    try { const t = new URL(target); return t.origin === origin ? t.href : null; } catch { return null; }
  };

  // ---------------------------------------------------------------- Auth API (subset of Supabase Auth)
  async function authRoute(req, res, u, origin) {
    const route = `${req.method} ${u.pathname}`;

    if (route === 'POST /auth/v1/signup') {
      claimsFor(req, { authApi: true });
      const body = await readJson(req);
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      if (!EMAIL.test(email)) throw authError(400, 'validation_failed', 'Unable to validate email address: invalid format');
      if (password.length < MIN_PASSWORD) throw authError(422, 'weak_password', `Password should be at least ${MIN_PASSWORD} characters.`);
      if (await userRow('lower(email)', email)) throw authError(422, 'user_already_exists', 'User already registered');
      const fullName = String(body.data?.full_name ?? '').trim().slice(0, 80);
      const id = randomUUID();
      await state.db.query(`insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at, last_sign_in_at)
                            values ($1, $2, $3, $4, now(), now())`, [id, email, await hashPassword(password), { full_name: fullName }]);
      return send(res, 200, newSession(await userRow('id', id)));
    }

    if (route === 'POST /auth/v1/token') {
      claimsFor(req, { authApi: true });
      const body = await readJson(req);
      const grant = u.searchParams.get('grant_type');
      if (grant === 'password') {
        const user = await userRow('lower(email)', String(body.email ?? '').trim().toLowerCase());
        const ok = await checkPassword(String(body.password ?? ''), user?.encrypted_password ?? dummyHash);
        if (!user || !ok) throw authError(400, 'invalid_credentials', 'Invalid login credentials');
        await state.db.query(`update auth.users set last_sign_in_at = now() where id = $1`, [user.id]);
        return send(res, 200, newSession(await userRow('id', user.id)));
      }
      if (grant === 'refresh_token') {
        const entry = state.refresh.get(String(body.refresh_token ?? ''));
        if (!entry) throw authError(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
        state.refresh.delete(String(body.refresh_token));          // rotate: each refresh token works once
        const user = await userRow('id', entry.userId);
        if (!user) throw authError(400, 'user_not_found', 'User not found');
        return send(res, 200, newSession(user));
      }
      throw authError(400, 'unsupported_grant_type', 'Unsupported grant type');
    }

    if (route === 'GET /auth/v1/user') return send(res, 200, publicUser(await currentUser(req)));

    if (route === 'PUT /auth/v1/user') {
      const user = await currentUser(req);
      const body = await readJson(req);
      if (body.password !== undefined) {
        if (String(body.password).length < MIN_PASSWORD) throw authError(422, 'weak_password', `Password should be at least ${MIN_PASSWORD} characters.`);
        await state.db.query(`update auth.users set encrypted_password = $2, updated_at = now() where id = $1`, [user.id, await hashPassword(String(body.password))]);
      }
      if (body.data && typeof body.data === 'object') {
        await state.db.query(`update auth.users set raw_user_meta_data = raw_user_meta_data || $2, updated_at = now() where id = $1`, [user.id, body.data]);
      }
      return send(res, 200, publicUser(await userRow('id', user.id)));
    }

    if (route === 'POST /auth/v1/logout') {
      const user = await currentUser(req);
      for (const [t, e] of state.refresh) if (e.userId === user.id) state.refresh.delete(t);
      return send(res, 204);
    }

    if (route === 'POST /auth/v1/recover') {
      claimsFor(req, { authApi: true });
      const body = await readJson(req);
      const user = await userRow('lower(email)', String(body.email ?? '').trim().toLowerCase());
      if (user) {
        const token = randomToken();
        const redirect = okRedirect(origin, u.searchParams.get('redirect_to') ?? '') ?? `${origin}/portal/`;
        state.recovery.set(token, { userId: user.id, expires: Date.now() + RECOVERY_TTL * 1000 });
        const link = `${origin}/auth/v1/verify?token=${token}&type=recovery&redirect_to=${encodeURIComponent(redirect)}`;
        state.outbox.push({ to: user.email, subject: 'Reset your Nuvora password', link, sent_at: new Date().toISOString() });
        log(`[email] password reset for ${user.email}: ${link}`);
      }
      return send(res, 200, {});                                   // same answer whether or not the email exists
    }

    if (route === 'GET /auth/v1/verify') {
      const redirect = okRedirect(origin, u.searchParams.get('redirect_to') ?? '') ?? `${origin}/portal/`;
      const token = u.searchParams.get('token') ?? '';
      const entry = state.recovery.get(token);
      state.recovery.delete(token);                                 // single use
      const user = entry && entry.expires > Date.now() && u.searchParams.get('type') === 'recovery' && await userRow('id', entry.userId);
      if (!user) {
        res.writeHead(303, { Location: `${redirect}#error=access_denied&error_code=otp_expired&error_description=${encodeURIComponent('Email link is invalid or has expired')}` });
        return res.end();
      }
      const s = newSession(user);
      const hash = new URLSearchParams({ access_token: s.access_token, expires_at: s.expires_at, expires_in: s.expires_in,
                                         refresh_token: s.refresh_token, token_type: 'bearer', type: 'recovery' });
      res.writeHead(303, { Location: `${redirect}#${hash}` });
      return res.end();
    }

    throw authError(404, 'not_found', 'Not found');
  }

  // ---------------------------------------------------------------- REST API (RPC only)
  async function restRoute(req, res, u) {
    const m = /^\/rest\/v1\/rpc\/([^/]+)$/.exec(u.pathname);
    if (!m || req.method !== 'POST') {
      throw restError(404, 'PGRST125', 'Only /rest/v1/rpc/<function> is available locally; the portal reads through functions');
    }
    const claims = claimsFor(req);
    const fn = decodeURIComponent(m[1]);
    if (!NAME.test(fn)) throw restError(404, 'PGRST202', `Could not find the function public.${fn}`);
    const args = await readJson(req);
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw restError(400, 'PGRST102', 'Arguments must be a JSON object');
    const names = Object.keys(args);
    for (const n of names) if (!NAME.test(n)) throw restError(400, 'PGRST102', `Invalid argument name: ${n}`);

    const procs = (await state.db.query(`select p.proretset as set, p.prorettype = 'void'::regtype as void
                                         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                         where n.nspname = 'public' and p.proname = $1`, [fn])).rows;
    if (!procs.length) throw restError(404, 'PGRST202', `Could not find the function public.${fn}`);

    const call = `public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')})`;
    const params = names.map((n) => (args[n] !== null && typeof args[n] === 'object' ? JSON.stringify(args[n]) : args[n]));
    const sql = procs[0].set ? `select * from ${call}` : `select ${call} as result`;
    let r;
    try {
      r = await runAs(state.db, claims.role, claims, sql, params);
    } catch (e) {
      throw restError(pgStatus(e.code, claims.role), e.code ?? 'XX000', e.message, e.detail ?? null, e.hint ?? null);
    }
    if (procs[0].set) return send(res, 200, r.rows);
    if (procs[0].void) return send(res, 204);
    return send(res, 200, r.rows[0]?.result ?? null);
  }

  // ---------------------------------------------------------------- Storage API (PDF uploads and signed downloads)
  // Same shape as Supabase Storage: POST .../object/sign/<bucket>/<path> asks for a short-lived link, which
  // the storage row-level security rules allow or refuse; GET on that link (with its token) returns the file.
  // Admins upload with POST .../object/<bucket>/<path> (the file's bytes as the body) and delete with
  // DELETE .../object/<bucket> {"prefixes": [...]}; both go through the same row-level security rules, and an
  // upload is also held to the bucket's file types and size limit, like Supabase Storage.
  const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');
  const storageError = (status, message, statusCode = String(status), error = 'error') => new HttpError(status, { statusCode, error, message });

  async function storageRoute(req, res, u) {
    const obj = /^\/storage\/v1\/object\/(?!sign\/)([^/]+)(?:\/(.+))?$/.exec(u.pathname);
    if (obj && req.method === 'POST' && obj[2]) return upload(req, res, obj[1], obj[2]);
    if (obj && req.method === 'DELETE' && !obj[2]) return removeFiles(req, res, obj[1]);
    const m = /^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/.exec(u.pathname);
    if (!m) throw storageError(404, 'Not found', '404', 'not_found');
    let bucket, name;
    try { bucket = decodeURIComponent(m[1]); name = decodeURIComponent(m[2]); } catch { throw storageError(400, 'Invalid path'); }

    if (req.method === 'POST') {
      const claims = claimsFor(req);
      const body = await readJson(req);
      const expiresIn = Math.min(Math.max(Math.floor(Number(body.expiresIn) || 60), 1), 3600);
      const allowed = await runAs(state.db, claims.role, claims, `select 1 from storage.objects where bucket_id = $1 and name = $2`, [bucket, name]);
      if (!allowed.rows.length) throw storageError(400, 'Object not found', '404', 'not_found');
      const now = Math.floor(Date.now() / 1000);
      const token = signJwt({ url: `${bucket}/${name}`, iat: now, exp: now + expiresIn }, secret);
      return send(res, 200, { signedURL: `/object/sign/${encodePath(bucket)}/${encodePath(name)}?token=${token}` });
    }

    if (req.method === 'GET') {
      const claims = verifyJwt(u.searchParams.get('token') ?? '', secret);
      if (!claims || claims.url !== `${bucket}/${name}`) throw storageError(400, 'Invalid or expired link', '400', 'InvalidSignature');
      const row = (await state.db.query(`select metadata from storage.objects where bucket_id = $1 and name = $2`, [bucket, name])).rows[0];
      if (!row) throw storageError(400, 'Object not found', '404', 'not_found');
      // An uploaded file is served as uploaded; the demo's files are generated on the fly.
      const pdf = state.files.get(`${bucket}/${name}`) ?? placeholderPdf(row.metadata?.title ?? name, [
        'Sample course material generated by the local test server.',
        'In production this is the PDF uploaded by your admin.', '', `File: ${name}`]);
      const wanted = u.searchParams.get('download');
      const filename = (wanted || name.split('/').pop()).replace(/[^\w.\- ]+/g, '_').slice(0, 120);
      res.writeHead(200, {
        'Content-Type': 'application/pdf', 'Content-Length': pdf.length, 'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': wanted !== null ? `attachment; filename="${filename.endsWith('.pdf') ? filename : `${filename}.pdf`}"` : 'inline',
      });
      return res.end(pdf);
    }
    throw storageError(405, 'Method not allowed');
  }

  // Upload one file. Checked in Supabase's order: the bucket's file types, its size limit, then the row-level
  // security rules (for course files: admins only, PDFs in a program folder). Existing files are never replaced.
  async function upload(req, res, rawBucket, rawName) {
    let bucket, name;
    try { bucket = decodeURIComponent(rawBucket); name = decodeURIComponent(rawName); } catch { throw storageError(400, 'Invalid path'); }
    const claims = claimsFor(req);
    const b = (await state.db.query(`select file_size_limit, allowed_mime_types from storage.buckets where id = $1`, [bucket])).rows[0];
    if (!b) throw storageError(404, 'Bucket not found', '404', 'Bucket not found');
    const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() || 'application/octet-stream';
    if (b.allowed_mime_types?.length && !b.allowed_mime_types.includes(type)) {
      req.resume();
      throw storageError(415, `mime type ${type} is not supported`, '415', 'invalid_mime_type');
    }
    const limit = Math.min(Number(b.file_size_limit) || MAX_UPLOAD, MAX_UPLOAD);
    const tooLarge = () => storageError(413, 'The object exceeded the maximum allowed size', '413', 'Payload too large');
    if (Number(req.headers['content-length']) > limit) { req.resume(); throw tooLarge(); }
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > limit) { req.resume(); throw tooLarge(); }
      chunks.push(c);
    }
    const body = Buffer.concat(chunks);
    // The local server also looks inside: a PDF must start with the PDF signature.
    if (type === 'application/pdf' && body.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw storageError(415, 'The file is not a PDF', '415', 'invalid_pdf');
    }
    let r;
    try {
      r = await runAs(state.db, claims.role, claims,
        `insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4) returning id`,
        [bucket, name, claims.role === 'authenticated' ? claims.sub : null, { mimetype: type, size: body.length, contentLength: body.length }]);
    } catch (e) {
      if (e.code === '23505') throw storageError(409, 'The resource already exists', '409', 'Duplicate');
      if (e.code === '42501') throw storageError(403, 'new row violates row-level security policy', '403', 'Unauthorized');
      throw e;
    }
    state.files.set(`${bucket}/${name}`, body);
    return send(res, 200, { Key: `${bucket}/${name}`, Id: r.rows[0].id });
  }

  // Delete files: only those the row-level security rules let the caller delete (for course files: admins,
  // and only files no lesson or project uses). Returns the deleted objects, like Supabase.
  async function removeFiles(req, res, rawBucket) {
    let bucket;
    try { bucket = decodeURIComponent(rawBucket); } catch { throw storageError(400, 'Invalid path'); }
    const claims = claimsFor(req);
    const { prefixes } = await readJson(req);
    if (!Array.isArray(prefixes) || !prefixes.length || prefixes.length > 1000 || prefixes.some((p) => typeof p !== 'string')) {
      throw storageError(400, 'prefixes must be a list of file names');
    }
    const r = await runAs(state.db, claims.role, claims,
      `delete from storage.objects where bucket_id = $1 and name = any($2::text[])
       returning id, name, bucket_id, owner, metadata, created_at, updated_at`, [bucket, prefixes]);
    for (const row of r.rows) state.files.delete(`${bucket}/${row.name}`);
    return send(res, 200, r.rows);
  }

  // ---------------------------------------------------------------- test-only API
  async function testRoute(req, res, u) {
    // Custom header: browsers cannot send it cross-site without a CORS preflight, which this server never grants.
    if (req.headers['x-nuvora-test'] !== '1') throw restError(403, 'TEST', 'Missing X-Nuvora-Test header');
    const route = `${req.method} ${u.pathname}`;
    if (route === 'POST /__test/reset') { await reset(); return send(res, 200, { ok: true, demo: state.demo }); }
    if (route === 'POST /__test/sql') {
      const { sql, params = [] } = await readJson(req);
      return send(res, 200, (await state.db.query(String(sql), params)).rows);
    }
    if (route === 'GET /__test/outbox') return send(res, 200, state.outbox);
    throw restError(404, 'TEST', 'Unknown test route');
  }

  // ---------------------------------------------------------------- static files
  async function serveStatic(req, res, u, origin) {
    if (u.pathname === '/portal/config.js') {
      const body = `window.NUVORA_CONFIG = Object.freeze(${JSON.stringify({ supabaseUrl: origin, anonKey, environment: 'local' })});\n`;
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(body);
    }
    if (u.pathname === '/portal') { res.writeHead(301, { Location: '/portal/' }); return res.end(); }

    let decoded;
    try { decoded = decodeURIComponent(u.pathname); } catch { return notFound(res); }
    const [prefix, dir] = STATIC_ROOTS.find(([p]) => decoded.startsWith(p));
    const rel = decoded.slice(prefix.length);
    if (rel.split('/').some((part) => part.startsWith('.')) || rel.includes('\\') || rel.includes('\0')) return notFound(res);
    let file = resolve(dir, rel || 'index.html');
    if (file !== dir && !file.startsWith(dir + sep)) return notFound(res);
    let info = await stat(file).catch(() => null);
    if (info?.isDirectory()) {
      // Clean URLs: /programs -> /programs/ (the page's relative links and canonical use the trailing slash).
      if (!decoded.endsWith('/')) { res.writeHead(301, { Location: `${u.pathname}/${u.search}` }); return res.end(); }
      file = resolve(file, 'index.html'); info = await stat(file).catch(() => null);
    }
    if (!info?.isFile()) return prefix === '/' ? sitePage(res, resolve(siteDir, '404.html'), 404) : notFound(res);

    const headers = {
      'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Accept-Ranges': 'bytes',
    };
    if (prefix === '/portal/') { headers['X-Frame-Options'] = 'DENY'; headers['X-Robots-Tag'] = 'noindex, nofollow'; }
    else if (file.endsWith('.html')) headers['X-Frame-Options'] = 'SAMEORIGIN';
    const data = await readFile(file);
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, data.length - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
      if (start > end || start >= data.length) { res.writeHead(416, { 'Content-Range': `bytes */${data.length}` }); return res.end(); }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 });
      return res.end(req.method === 'HEAD' ? undefined : data.subarray(start, end + 1));
    }
    res.writeHead(200, { ...headers, 'Content-Length': data.length });
    return res.end(req.method === 'HEAD' ? undefined : data);
  }

  const notFound = (res) => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); };
  async function sitePage(res, file, status) {
    const data = await readFile(file).catch(() => null);
    if (!data) return notFound(res);
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end(data);
  }

  // ---------------------------------------------------------------- dispatch
  let actualPort = port;
  const allowedHosts = () => new Set([`127.0.0.1:${actualPort}`, `localhost:${actualPort}`, `[::1]:${actualPort}`]);

  async function handle(req, res) {
    // Only answer to local host names: blocks DNS-rebinding pages from reaching this server.
    const hostHeader = String(req.headers.host ?? '').toLowerCase();
    if (!allowedHosts().has(hostHeader)) return send(res, 403, { message: 'Unknown host' });
    const origin = `http://${hostHeader}`;
    if (req.headers.origin && req.headers.origin !== origin) return send(res, 403, { message: 'Cross-origin requests are not allowed' });
    const u = new URL(req.url, origin);
    try {
      if (u.pathname.startsWith('/auth/v1/')) return await authRoute(req, res, u, origin);
      if (u.pathname.startsWith('/rest/v1/')) return await restRoute(req, res, u);
      if (u.pathname.startsWith('/storage/v1/')) return await storageRoute(req, res, u);
      if (u.pathname.startsWith('/__test/')) return testApi ? await testRoute(req, res, u) : notFound(res);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { message: 'Method not allowed' });
      return await serveStatic(req, res, u, origin);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, e.body);
      console.error(e);
      return send(res, 500, { code: 'XX000', message: 'Internal error' });
    }
  }

  const server = http.createServer((req, res) => { handle(req, res); });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, host, ok); });
  actualPort = server.address().port;
  const url = `http://${host === '::1' ? '[::1]' : host}:${actualPort}`;
  log(`Nuvora local server: website ${url}/  portal ${url}/portal/${testApi ? '  (test API on)' : ''}`);

  return {
    url, anonKey, serviceKey, state, reset,
    async close() {
      await new Promise((ok) => { server.close(ok); server.closeAllConnections(); });
      await closeDb(state.db);
      watchers.forEach((w) => w.close());
      if (build) await rm(siteDir, { recursive: true, force: true });
    },
  };
}

// PostgREST's mapping from PostgreSQL error codes to HTTP status codes (the parts we use).
export function pgStatus(code, role) {
  if (code === '42501') return role === 'anon' ? 401 : 403;
  if (code === '42883' || code === 'P0002') return 404;
  if (code?.startsWith('23')) return 409;
  if (code === 'P0001' || code?.startsWith('22') || code?.startsWith('42')) return 400;
  return 500;
}

// Command line: node server/dev-server.mjs [--port 5173] [--test-api] [--no-demo] [--watch] [--portal-dir <folder>]
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2);
  const opt = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
  const s = await startServer({
    port: Number(opt('--port', process.env.PORT ?? 5173)),
    testApi: argv.includes('--test-api'),
    demo: !argv.includes('--no-demo'),
    watch: argv.includes('--watch'),
    ...(opt('--portal-dir') ? { portalDir: opt('--portal-dir') } : {}),
  });
  console.log('Demo accounts (local only): see server/demo-accounts.mjs');
  const stop = async () => { await s.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
