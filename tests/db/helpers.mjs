// Test harness: a fresh in-memory PostgreSQL with a Supabase-like auth layer, all migrations and the seed.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const root = new URL('../../supabase/', import.meta.url);

// Mirrors what Supabase provides: auth.users, auth.uid() from the request JWT, and the three API roles.
const AUTH_STUB = `
  create schema auth;
  create table auth.users (id uuid primary key, email text unique, raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::json->>'sub', '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export async function freshDb() {
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  const files = readdirSync(new URL('migrations/', root)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await db.exec(readFileSync(new URL(`migrations/${f}`, root), 'utf8'));
  await db.exec(readFileSync(new URL('seed.sql', root), 'utf8'));
  // Used only by tests/sabotage.mjs: deliberately breaks a rule to prove the tests notice.
  if (process.env.NUVORA_SABOTAGE_SQL) await db.exec(process.env.NUVORA_SABOTAGE_SQL);

  // Run a query as a given role, the way Supabase's API does (SET ROLE + JWT claims, in one transaction).
  const run = (role, claims) => async (sql, params = []) =>
    db.transaction(async (tx) => {
      await tx.exec(`set local role ${role}`);
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      return tx.query(sql, params);
    });

  const h = {
    db,
    /** Query as the database owner (like a migration or the SQL editor). */
    sql: (text, params = []) => db.query(text, params),
    /** Query as a signed-in user. */
    as: (userId) => run('authenticated', { sub: userId, role: 'authenticated' }),
    /** Query as a signed-out visitor. */
    anon: run('anon', { role: 'anon' }),
    /** Query as server-side automation (webhooks, schedulers). */
    service: run('service_role', { role: 'service_role' }),
    /** Create a user the way sign-up does, optionally with a role. Returns its id. */
    async user(email, role = 'student', name = email.split('@')[0]) {
      const id = randomUUID();
      await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, { full_name: name }]);
      if (role !== 'student') await db.query(`update public.profiles set role = $2 where id = $1`, [id, role]);
      return id;
    },
    /** Returns the first column of the first row. */
    async one(fn, text, params) { const r = await fn(text, params); const row = r.rows[0]; return row ? Object.values(row)[0] : undefined; },
  };
  return h;
}

/** Expect a promise to reject; returns the error (optionally checking message or SQLSTATE code). */
export async function rejects(promise, match) {
  try { await promise; } catch (e) {
    if (match && !(match instanceof RegExp ? match.test(e.message) : e.code === match || e.message.includes(match))) {
      throw new Error(`Rejected, but with an unexpected error: [${e.code}] ${e.message}`);
    }
    return e;
  }
  throw new Error('Expected the call to be refused, but it succeeded');
}
