// Privilege audit. Supabase opens every new table and function to visitors (anon) and signed-in users
// (authenticated) by default. These tests list what each role can actually reach and fail on anything
// not on the approved lists below, so a future migration cannot quietly open something up.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.mjs';

// Functions each role may call. Everything else in `public` must be closed to them.
const ANON_FUNCTIONS = ['first_monday', 'next_start_date'];
const AUTHENTICATED_FUNCTIONS = [
  // used inside security rules (can_read_material: the storage rule for PDF downloads)
  'can_read_material', 'can_see_batch', 'is_admin', 'my_active_batches', 'teaches',
  'first_monday', 'next_start_date',
  // student actions and pages
  'record_progress', 'mark_reading_done', 'submit_assignment', 'my_dashboard', 'my_course', 'my_lesson',
  'my_sessions', 'my_assignments', 'my_notifications', 'mark_notifications_read', 'update_my_profile',
  // staff
  'grade_submission', 'staff_at_risk', 'staff_overview', 'staff_grading_queue', 'staff_roster',
  // admin (each checks the admin role itself)
  'admin_create_batch', 'admin_enroll', 'admin_transfer', 'admin_set_enrollment_status', 'admin_set_role',
  'admin_assign_staff', 'require_admin',
].sort();

// Tables (and for partial grants, the columns) each role may read or change.
const ANON_SELECT = { programs: '*', modules: '*', lessons: ['code', 'duration_seconds', 'id', 'kind', 'module_id', 'position', 'title'] };
const AUTH_SELECT = {
  programs: '*', modules: '*', lessons: ANON_SELECT.lessons, profiles: '*', batches: '*', batch_staff: '*',
  enrollments: '*', batch_assignments: '*', submissions: '*', lesson_progress: '*', attendance: '*', notifications: '*',
  session_templates: '*', assignment_templates: '*',
  sessions: ['batch_id', 'ends_at', 'id', 'starts_at', 'status', 'template_id', 'title'],
};
const AUTH_UPDATE = { profiles: ['full_name'], notifications: ['read_at'] };

let h, tables;
before(async () => {
  h = await freshDb();
  tables = (await h.sql(`select c.relname as t, c.relrowsecurity as rls from pg_class c
                         join pg_namespace n on n.oid = c.relnamespace
                         where n.nspname = 'public' and c.relkind = 'r' order by 1`)).rows;
});

const callable = async (role) => (await h.sql(
  `select distinct p.proname as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege($1, p.oid, 'EXECUTE') order by 1`, [role])).rows.map((r) => r.f);

const columns = async (role, table, priv) => {
  const all = (await h.sql(`select attname as c from pg_attribute where attrelid = ('public.' || $1)::regclass
                            and attnum > 0 and not attisdropped order by 1`, [table])).rows.map((r) => r.c);
  const ok = [];
  for (const c of all) {
    if (await h.one(h.sql, `select has_column_privilege($1, ('public.' || $2)::regclass, $3, $4)`, [role, table, c, priv])) ok.push(c);
  }
  return ok.length === all.length ? '*' : ok;
};

test('visitors can call only the date helpers', async () => {
  assert.deepEqual(await callable('anon'), ANON_FUNCTIONS);
});

test('signed-in users can call only the approved functions', async () => {
  assert.deepEqual(await callable('authenticated'), AUTHENTICATED_FUNCTIONS);
});

test('every table has row-level security switched on', async () => {
  assert.deepEqual(tables.filter((t) => !t.rls).map((t) => t.t), []);
});

test('visitors can read only the public catalog, and change nothing', async () => {
  for (const { t } of tables) {
    const sel = await columns('anon', t, 'SELECT');
    assert.deepEqual(sel.length ? sel : undefined, ANON_SELECT[t], `anon SELECT on ${t}`);
    for (const priv of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      assert.equal(await h.one(h.sql, `select has_table_privilege('anon', ('public.' || $1)::regclass, $2)`, [t, priv]), false, `anon ${priv} on ${t}`);
    }
  }
});

test('signed-in users read only approved columns and change only their name and read receipts', async () => {
  for (const { t } of tables) {
    const sel = await columns('authenticated', t, 'SELECT');
    assert.deepEqual(sel.length ? sel : undefined, AUTH_SELECT[t], `authenticated SELECT on ${t}`);
    const upd = await columns('authenticated', t, 'UPDATE');
    assert.deepEqual(upd.length ? upd : undefined, AUTH_UPDATE[t], `authenticated UPDATE on ${t}`);
    for (const priv of ['INSERT', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      assert.equal(await h.one(h.sql, `select has_table_privilege('authenticated', ('public.' || $1)::regclass, $2)`, [t, priv]), false, `authenticated ${priv} on ${t}`);
    }
  }
});
