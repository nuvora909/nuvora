// Shared steps for the browser tests.
import { expect } from './fixtures.mjs';
import { ACCOUNTS, DEMO_PASSWORD } from '../../server/demo-accounts.mjs';

export { ACCOUNTS, DEMO_PASSWORD };
const TEST = { 'X-Nuvora-Test': '1' };

/** Fresh database with the demo scenario. Returns ids of the demo batches and users. */
export async function reset(request) {
  const r = await request.post('/__test/reset', { headers: TEST });
  expect(r.ok()).toBeTruthy();
  return (await r.json()).demo;
}

/** Run SQL as the database owner (test setup and checks only). */
export async function sql(request, text, params = []) {
  const r = await request.post('/__test/sql', { headers: TEST, data: { sql: text, params } });
  if (!r.ok()) throw new Error(`SQL failed: ${await r.text()}`);
  return r.json();
}
export const one = async (request, text, params) => { const rows = await sql(request, text, params); return rows[0] ? Object.values(rows[0])[0] : undefined; };

export async function login(page, who, { remember = true, password = DEMO_PASSWORD } = {}) {
  await page.goto('/portal/#/login');
  await page.getByLabel('Email address').fill(ACCOUNTS[who].email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  // The box is unticked by default; tests that look at stored sessions tick it.
  if (remember) await page.getByLabel('Keep me signed in on this device').check();
  await page.getByRole('button', { name: 'Log in' }).click();
}

export const HOME = { student: /#\/home$/, instructor: /#\/teach$/, admin: /#\/admin$/ };

export async function loginAs(page, who) {
  await login(page, who);
  await expect(page).toHaveURL(HOME[ACCOUNTS[who].role]);
  await expect(page.locator('.app main h1')).toBeVisible();                     // the signed-in portal, not the sign-in page
}

/** Signs out by forgetting the session and loading the portal afresh, then signs in as someone else. */
export async function switchTo(page, who) {
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto('about:blank');
  await loginAs(page, who);
}

/** Collects console errors and failed requests so every test can assert the page stayed healthy. */
export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 40[134]/.test(m.text())) errors.push(`console: ${m.text()}`); });
  return errors;
}
