// The brochure modal: a dialog for requesting program brochures via phone/email.
// Loaded on first use.
import { CATALOG } from './catalog.mjs';

const PROGRAMS = CATALOG.programs;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const CLOSE_ICON = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12 M18 6L6 18"/></svg>';

let modal, form, programSelect, returnTo;
let currentProgramId = null;

function build() {
  modal = document.createElement('dialog');
  modal.className = 'brochure-modal';
  modal.setAttribute('aria-labelledby', 'brochure-title');
  modal.innerHTML = `
    <div class="brochure-panel">
      <style>
        .brochure-highlight {
          font-weight: 600;
          color: var(--gold);
        }
      </style>
      <header class="brochure-header">
        <div>
          <p class="brochure-kicker">PROGRAM GUIDE</p>
          <h2 id="brochure-title">Get the program <span class="brochure-highlight">brochure</span></h2>
        </div>
        <button class="close" type="button" aria-label="Close brochure">${CLOSE_ICON}</button>
      </header>
      <div class="brochure-body">
      <form class="brochure-request-form" data-brochure-form novalidate>
        <p class="brochure-notice"><span class="brochure-highlight">Brochure</span> requests are not connected yet. Your details will not be sent from this site.</p>
        <div class="brochure-form-field">
          <label for="brochure-program">Program</label>
          <select id="brochure-program" name="program" required>
            <option value="">Select a program</option>
            ${PROGRAMS.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>

        <div class="brochure-form-field">
          <label for="brochure-email">Email address</label>
          <input id="brochure-email" name="email" type="email" required
                 autocomplete="email" maxlength="254">
        </div>

        <div class="brochure-form-field">
          <label for="brochure-phone">Phone number (optional)</label>
          <input id="brochure-phone" name="phone" type="tel"
                 autocomplete="tel" maxlength="24">
        </div>

        <div class="brochure-form-consent">
          <label class="check">
            <input type="checkbox" name="consent" required>
            <span>I agree that Nuvora may use these details to send the <span class="brochure-highlight">brochure</span> and follow up. Read the <a href="/legal/privacy/">privacy notice</a>.</span>
          </label>
        </div>

        <div class="brochure-form-actions">
          <button class="btn ghost" type="button" data-brochure-cancel>Cancel</button>
          <button class="btn gold" type="submit" data-brochure-submit>Request <span class="brochure-highlight">brochure</span></button>
        </div>
        <p class="brochure-status" data-brochure-status role="status" hidden></p>
      </form>
        <div class="brochure-art" aria-hidden="true">
          <span class="brochure-art-book"></span>
          <span class="brochure-art-label">NUVORA · PROGRAM GUIDE</span>
        </div>
      </div>
    </div>
  `;

  form = modal.querySelector('[data-brochure-form]');
  programSelect = modal.querySelector('#brochure-program');

  // Close button
  modal.querySelector('.close').addEventListener('click', closeBrochure);

  // Cancel button
  modal.querySelector('[data-brochure-cancel]').addEventListener('click', closeBrochure);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const status = modal.querySelector('[data-brochure-status]');
    status.textContent = 'Your details were not sent. <span class="brochure-highlight">Brochure</span> requests are not connected yet.';
    status.hidden = false;
  });

  programSelect.addEventListener('change', (e) => {
    currentProgramId = e.target.value;
    const program = PROGRAMS.find((item) => item.id === currentProgramId);
    if (program) {
      const slug = String(program.url).split('/').filter(Boolean).at(-1);
      modal.style.setProperty('--brochure-cover', `url("/covers/${encodeURIComponent(slug)}-brochure.svg")`);
    }
  });

  modal.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeBrochure();
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) closeBrochure(); });

  document.querySelector('[data-brochure-root]').append(modal);
}

export function openBrochure({ programId, returnFocus } = {}) {
  if (!modal) build();
  returnTo = returnFocus ?? document.activeElement;
  if (programId && programSelect) {
    programSelect.value = programId;
    currentProgramId = programId;
    programSelect.dispatchEvent(new Event('change'));
  }
  modal.showModal();
  document.body.classList.add('brochure-modal-open');
  programSelect?.focus({ preventScroll: true });
}

export function closeBrochure() {
  if (!modal) return;

  if (modal.open) modal.close();
  document.body.classList.remove('brochure-modal-open');
  form?.reset();
  const status = modal.querySelector('[data-brochure-status]');
  status.hidden = true;
  status.textContent = '';
  currentProgramId = null;
  returnTo?.focus?.();
}
