// Signing in, signing up, password reset, sign-out and expired sessions.
import { test, expect } from '@playwright/test';
import { reset, sql, login, loginAs, watchErrors, ACCOUNTS, DEMO_PASSWORD } from './helpers.mjs';

test.beforeEach(async ({ request }) => { await reset(request); });

test('pages need a signed-in user, and sign-in returns you to the page you asked for', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/portal/#/assignments');
  await expect(page).toHaveURL(/#\/login$/);
  await login(page, 'student');
  await expect(page).toHaveURL(/#\/assignments$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Assignments' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a wrong password shows a clear message and stores no session', async ({ page }) => {
  await login(page, 'student', { password: 'definitely-wrong' });
  await expect(page.getByRole('alert')).toContainText('don’t match');
  await expect(page).toHaveURL(/#\/login$/);
  expect(await page.evaluate(() => localStorage.getItem('nuvora.session') ?? sessionStorage.getItem('nuvora.session'))).toBeNull();
});

test('"keep me signed in" off keeps the session in this tab only', async ({ page }) => {
  await login(page, 'student', { remember: false });
  await expect(page).toHaveURL(/#\/home$/);
  const where = await page.evaluate(() => [Boolean(localStorage.getItem('nuvora.session')), Boolean(sessionStorage.getItem('nuvora.session'))]);
  expect(where).toEqual([false, true]);
});

test('a new account lands on a friendly "not enrolled yet" page', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/portal/#/signup');
  await page.getByLabel('Full name').fill('Priya Nair');
  await page.getByLabel('Email address').fill('priya.nair@nuvora.test');
  await page.getByLabel('Password', { exact: true }).fill('a-good-password-1');
  await page.getByLabel('Confirm password').fill('a-good-password-2');
  await page.getByLabel(/I agree/).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toContainText('don’t match');
  await page.getByLabel('Confirm password').fill('a-good-password-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByText('You’re not enrolled in a batch yet')).toBeVisible();
  await expect(page.getByText(/The next one starts on/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore programs' })).toHaveAttribute('href', '/programs/');
  expect(errors).toEqual([]);
});

test('signing up twice with one email explains what to do', async ({ page }) => {
  await page.goto('/portal/#/signup');
  await page.getByLabel('Full name').fill('Maya Again');
  await page.getByLabel('Email address').fill(ACCOUNTS.student.email);
  await page.getByLabel('Password', { exact: true }).fill('another-password-1');
  await page.getByLabel('Confirm password').fill('another-password-1');
  await page.getByLabel(/I agree/).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toContainText('already exists');
});

test('password reset by email link, which works only once', async ({ page, request }) => {
  await page.goto('/portal/#/forgot');
  await page.getByLabel('Email address').fill(ACCOUNTS.student.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'reset link is on its way' })).toBeVisible();

  const outbox = await (await request.get('/__test/outbox', { headers: { 'X-Nuvora-Test': '1' } })).json();
  const link = outbox.at(-1).link;
  await page.goto(link);
  await expect(page).toHaveURL(/#\/reset$/);
  expect(page.url()).not.toContain('access_token');                       // tokens removed from the address bar
  await page.getByLabel('New password', { exact: true }).fill('my-new-password-1');
  await page.getByLabel('Confirm new password').fill('my-new-password-1');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page).toHaveURL(/#\/home$/);

  await page.getByRole('button', { name: /Maya Patel/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await login(page, 'student');
  await expect(page.getByRole('alert')).toContainText('don’t match');      // old password no longer works
  await login(page, 'student', { password: 'my-new-password-1' });
  await expect(page).toHaveURL(/#\/home$/);

  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(link);                                                     // second use of the same link
  await expect(page).toHaveURL(/#\/forgot$/);
  await expect(page.getByRole('alert').first()).toContainText(/invalid or has expired/);
});

test('signing out clears the session; the back button shows nothing private', async ({ page }) => {
  await loginAs(page, 'student');
  await page.getByRole('button', { name: /Maya Patel/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/#\/login$/);
  await expect(page.getByRole('status')).toContainText('You’ve signed out');
  await page.goBack();
  await expect(page).toHaveURL(/#\/login$/);
  await expect(page.getByText(/Good (morning|afternoon|evening), Maya/)).toHaveCount(0);
});

test('an invalid or revoked session sends you back to sign in', async ({ page, request }) => {
  await loginAs(page, 'student');
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('nuvora.session'));
    s.access_token = s.access_token.slice(0, -4) + 'AAAA';                   // break the signature
    localStorage.setItem('nuvora.session', JSON.stringify(s));
  });
  await page.reload();
  await expect(page).toHaveURL(/#\/login$/);
  await expect(page.getByRole('status')).toContainText('session ended');
  expect(await sql(request, 'select 1 as ok')).toEqual([{ ok: 1 }]);
});

test('an expired access token is refreshed silently', async ({ page }) => {
  await loginAs(page, 'student');
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('nuvora.session'));
    s.expires_at = Math.floor(Date.now() / 1000) - 10;                        // pretend it expired
    localStorage.setItem('nuvora.session', JSON.stringify(s));
  });
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('nuvora.session')).refresh_token);
  await page.reload();
  await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Maya/ })).toBeVisible();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('nuvora.session')).refresh_token);
  expect(after).not.toBe(before);
});

test('demo password is only for the local server', async () => {
  // Guard against shipping the demo password: it must never appear in portal code served to users.
  const { readFileSync, readdirSync } = await import('node:fs');
  const files = readdirSync('portal', { recursive: true }).filter((f) => /\.(js|html|css)$/.test(f));
  for (const f of files) expect(readFileSync(`portal/${f}`, 'utf8')).not.toContain(DEMO_PASSWORD);
});
