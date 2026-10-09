// Local PostgreSQL (PGlite, in-process) set up like a Supabase project: the auth schema, the three API
// roles, Supabase's default privileges, all migrations and the seed. Used by the tests and the dev server.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';


const root = new URL('../supabase/', import.meta.url);

// Mirrors what Supabase provides. Note the default privileges: on Supabase every new table and function
// in `public` is automatically open to anon and authenticated, so migrations must revoke explicitly.
export const AUTH_STUB = `
  create schema auth;
  create table auth.users (
    id                 uuid primary key,
    email              text unique,
    encrypted_password text,
    raw_user_meta_data jsonb not null default '{}',
    email_confirmed_at timestamptz,
    last_sign_in_at    timestamptz,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::json->>'sub', '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  -- Supabase Storage keeps file records in storage.objects, protected by row-level security.
  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null unique, owner uuid, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now()
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text,
    owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now(),
    unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  alter table storage.buckets enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export const ROLES = ['anon', 'authenticated', 'service_role'];

let template; // snapshot of a freshly migrated and seeded database, cloned for each new instance
const open = new Set(); // cloned databases keep the process alive until closed

async function build() {
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  const files = readdirSync(new URL('migrations/', root)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) await db.exec(readFileSync(new URL(`migrations/${f}`, root), 'utf8'));
  await db.exec(readFileSync(new URL('seed.sql', root), 'utf8'));
  return db;
}

/** A fresh, fully migrated and seeded database. The first call builds it; later calls clone a snapshot. */
export async function createDb() {
  if (!template) {
    const db = await build();
    template = await db.dumpDataDir('none');
    open.add(db);
    return db;
  }
  const db = new PGlite({ loadDataDir: template });
  await db.waitReady;
  open.add(db);
  return db;
}

/** Close one database (or every database this process created). Safe to call twice. */
export async function closeDb(db) {
  const list = db ? [db] : [...open];
  for (const d of list) { open.delete(d); if (!d.closed) await d.close(); }
}

/** Run one statement the way Supabase's API does: SET ROLE plus the caller's JWT claims, in one transaction. */
export function runAs(db, role, claims, sql, params = []) {
  if (!ROLES.includes(role)) throw new Error(`Unknown role ${role}`);
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    return tx.query(sql, params);
  });
}
