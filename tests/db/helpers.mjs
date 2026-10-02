// Test harness: a fresh in-memory PostgreSQL with a Supabase-like auth layer, all migrations and the seed.
import { randomUUID } from 'node:crypto';
import { after } from 'node:test';
import { createDb, closeDb, runAs } from '../../server/localdb.mjs';

// Close every database this test file opened, so the file's process can exit.
after(() => closeDb());

export async function freshDb() {
  const db = await createDb();
  // Used only by tests/sabotage.mjs: deliberately breaks a rule to prove the tests notice.
  if (process.env.NUVORA_SABOTAGE_SQL) await db.exec(process.env.NUVORA_SABOTAGE_SQL);

  const run = (role, claims) => (sql, params = []) => runAs(db, role, claims, sql, params);

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
