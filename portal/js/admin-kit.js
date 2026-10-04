// Shared pieces of the admin area: access and payment labels, money, the program list, forms and dialogs.
// Every admin action is checked again by the database (require_admin, the access rule, the audit log);
// what the browser checks here is only for quick, clear messages.
import { html, icon, toast, busy, $, $$ } from './ui.js';

// Access states as the database names them (docs/admin-api.md). Never colour alone: an icon and words too.
export const ACCESS = {
  paid: ['checkc', 'Paid', 'good'],
  grace: ['clock', 'Grace period', 'warn'],
  stopped_unpaid: ['lock', 'Stopped · unpaid', 'bad'],
  stopped_manual: ['lock', 'Stopped by admin', 'bad'],
  started_manual: ['shield', 'Started by admin', 'info'],
  closed: ['circle', 'Closed', ''],
};
export const ACCESS_FILTERS = [
  ['', 'Any access'], ['open', 'Open (any)'], ['ending_soon', 'Pausing within 7 days'], ['stopped', 'Stopped (any)'], ['paid', 'Paid'], ['grace', 'Grace period'],
  ['stopped_unpaid', 'Stopped · unpaid'], ['stopped_manual', 'Stopped by admin'], ['started_manual', 'Started by admin'], ['closed', 'Closed'],
];
export const ENROLLMENT_STATUS = { active: 'Active', reserved: 'Reserved', paused: 'Paused', completed: 'Completed', withdrawn: 'Withdrawn', none: 'Not enrolled' };
export const METHODS = { bank_transfer: 'Bank transfer', cash: 'Cash', waiver: 'Waiver', other: 'Other' };
export const REQUEST_STATUS = { new: 'New', contacted: 'Contacted', converted: 'Converted', closed: 'Closed' };

export const daysLeft = (n) => (n === null || n === undefined ? '' : n <= 0 ? 'ends today' : n === 1 ? '1 day left' : `${n} days left`);

/** The access state in words, with days left while access is counting down. */
export function accessText(a) {
  if (!a) return 'No enrollment';
  const [, label] = ACCESS[a.state] ?? ['', a.state];
  return a.days_left !== null && a.days_left !== undefined ? `${label} · ${daysLeft(a.days_left)}` : label;
}
export function accessPill(a) {
  if (!a) return html`<span class="pill">No enrollment</span>`;
  const [ic, , tone] = ACCESS[a.state] ?? ['circle', '', ''];
  const soon = a.days_left !== null && a.days_left !== undefined && a.days_left <= 7;
  return html`<span class="pill ${a.state === 'grace' && !soon ? 'info' : tone}">${icon(ic)} ${accessText(a)}</span>`;
}

export const money = (usd) => (usd === null || usd === undefined ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(usd)));

// Program ids and names come from the website's catalog (/js/catalog.mjs, built from scripts/catalog.mjs), the
// same single source the database seed uses.
let catalog = null;
export async function programs() {
  catalog ??= import('/js/catalog.mjs').then((m) => m.CATALOG.programs.map((p) => ({ id: p.id, name: p.name, terms: p.termCount })));
  return catalog;
}
export const programOptions = (list, selected = '', any = 'All programs') => html`${any ? html`<option value="">${any}</option>` : ''}
  ${list.map((p) => html`<option value="${p.id}"${p.id === selected ? ' selected' : ''}>${p.name}</option>`)}`;
export const options = (pairs, selected = '') => pairs.map(([v, label]) => html`<option value="${v}"${v === selected ? ' selected' : ''}>${label}</option>`);

/** Today's date (YYYY-MM-DD) in this browser, only as a default for date fields; the database checks dates. */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Wires a form: on submit, runs fn(form) with the button busy (it keeps focus); an error shows inside the form
 * (role=alert). An error about one field (problem(message, '#field')) marks that field invalid, links it to
 * the message and moves focus to it; any other error moves focus to the message. Success shows a toast. fn
 * returns the success message (or nothing for no toast).
 */
let errIds = 0;
export function onSubmit(form, fn) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('.formerr', form);
    const btn = e.submitter ?? $('button[type=submit]', form);
    if (btn?.dataset.busy) return;
    if (err) { err.hidden = true; err.id ||= `formerr-${++errIds}`; }
    for (const f of $$('[aria-invalid]', form)) {
      f.removeAttribute('aria-invalid');
      const rest = (f.getAttribute('aria-describedby') ?? '').split(' ').filter((id) => id && id !== err?.id).join(' ');
      if (rest) f.setAttribute('aria-describedby', rest); else f.removeAttribute('aria-describedby');
    }
    await busy(btn, async () => {
      try {
        const message = await fn(form);
        if (message) toast(message);
      } catch (ex) {
        if (!err) { toast(ex.message); return; }
        err.textContent = ex.message;
        err.hidden = false;
        const field = ex.field && $(ex.field, form);
        if (field) {
          field.setAttribute('aria-invalid', 'true');
          field.setAttribute('aria-describedby', [err.id, field.getAttribute('aria-describedby')].filter(Boolean).join(' '));
          field.focus();
        } else err.focus?.();
      }
    });
  });
}

/** Throw this from a form handler to show a message without calling the server; field: the field it is about. */
export const problem = (message, field = null) => Object.assign(new Error(message), { local: true, field });

/**
 * A modal dialog with a form (native <dialog>: focus stays inside, Escape cancels). action(form) runs on
 * submit; if it throws, the message shows in the dialog and it stays open; otherwise the dialog closes and
 * resolves with the action's result. Resolves null when cancelled.
 */
export function dialog({ title, body, confirm, danger = false, action }) {
  return new Promise((resolve) => {
    const id = `dlg-${Math.random().toString(36).slice(2, 8)}`;
    const d = document.createElement('dialog');
    d.className = 'dlg';
    d.setAttribute('aria-labelledby', `${id}-t`);
    d.innerHTML = String(html`<form class="stack" novalidate method="dialog">
      <h2 id="${id}-t">${title}</h2>
      <p class="formerr" role="alert" tabindex="-1" hidden></p>
      ${body}
      <p class="row dlg-actions"><button class="btn ghost" type="button" data-cancel>Cancel</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" type="submit">${confirm}</button></p>
    </form>`);
    document.body.append(d);
    const form = $('form', d);
    let result = null;
    const close = () => { d.close(); };
    d.addEventListener('close', () => { d.remove(); resolve(result); }, { once: true });
    $('[data-cancel]', d).addEventListener('click', close);
    onSubmit(form, async () => {
      result = await action(form);
      result ??= true;
      close();
    });
    d.showModal();
    ($('input:not([type=hidden]), select, textarea', form) ?? $('[type=submit]', form)).focus();
  });
}
