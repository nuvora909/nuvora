// The brochure modal: a dialog for requesting program brochures via phone/email.
// Loaded on first use.
import { html } from '../lib/html.mjs';
import { PROGRAMS } from '../data/programs.mjs';

const CLOSE_ICON = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12 M18 6L6 18"/></svg>';

let modal, form, programSelect, emailInput, phoneInput, submitButton, returnTo;
let currentProgramId = null;

// Get program name by ID
const getProgramName = (id) => {
  const program = PROGRAMS.find(p => p.id === id);
  return program ? program.name : '';
};

// Get brochure URL for a program
const getBrochureUrl = (id) => {
  // Map program IDs to brochure filenames
  const brochureMap = {
    'bs-ds': 'bs-data-science.html',
    'bs-aiml': 'bs-ai-machine-learning.html',
    'ms-aml': 'ms-applied-machine-learning.html',
    'ms-ds': 'ms-data-science-analytics.html',
    'c-py': 'certificate-python-data-analysis.html',
    'c-genai': 'certificate-generative-ai-llm-apps.html',
    'c-mlops': 'certificate-mlops-data-engineering.html'
  };

  const filename = brochureMap[id];
  return filename ? `/brochures/${filename}` : null;
};

function build() {
  modal = document.createElement('section');
  modal.className = 'brochure-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <header class="brochure-header">
      <h2 id="brochure-title">Program Brochure</h2>
      <button class="close" type="button" aria-label="Close brochure">${CLOSE_ICON}</button>
    </header>
    <div class="brochure-body">
      <!-- Form to request brochure access -->
      <form class="brochure-request-form" data-brochure-form novalidate>
        <div class="brochure-form-field">
          <label for="brochure-program">Program</label>
          <select id="brochure-program" name="program" required>
            <option value="">Select a program</option>
            ${PROGRAMS.map(p => html`<option value="${p.id}">${p.name}</option>`).join('')}
          </select>
          <p class="form-hint">Choose the program you want to learn more about</p>
        </div>

        <div class="brochure-form-field">
          <label for="brochure-email">Email address</label>
          <input id="brochure-email" name="email" type="email" required
                 autocomplete="email" maxlength="254">
          <p class="form-hint">We'll send the brochure to this address</p>
        </div>

        <div class="brochure-form-field">
          <label for="brochure-phone">Phone number (optional)</label>
          <input id="brochure-phone" name="phone" type="tel"
                 autocomplete="tel" maxlength="24">
          <p class="form-hint">Include your country code (e.g., +1 for US)</p>
        </div>

        <div class="brochure-form-consent">
          <label class="check">
            <input type="checkbox" name="consent" required>
            <span>I agree that Nuvora may use these details to send the brochure and follow up, as described in the <a href="/legal/privacy/#brochure-requests" target="_blank" rel="noopener">privacy notice</span></a>.</span></label>
        </div>

        <div class="brochure-form-actions">
          <button class="btn ghost" type="button" data-brochure-cancel>Cancel</button>
          <button class="btn gold" type="submit" data-brochure-submit>Request brochure</button>
        </div>
      </form>

      <!-- Brochure content area (initially hidden) -->
      <div class="brochure-content-area" data-brochure-content hidden></div>

      <!-- Success message area (initially hidden) -->
      <div class="brochure-success" data-brochure-success hidden>
        <p>Your brochure request has been received!</p>
        <p>The brochure for <span data-brochure-program-name></span> is ready for download.</p>
        <a href="#" class="btn gold" data-brochure-download>Download Brochure</a>
        <button class="btn ghost" type="button" data-brochure-close-success>Close</button>
      </div>
    </div>
  `;

  form = modal.querySelector('[data-brochure-form]');
  programSelect = modal.querySelector('#brochure-program');
  emailInput = modal.querySelector('#brochure-email');
  phoneInput = modal.querySelector('#brochure-phone');
  submitButton = modal.querySelector('[data-brochure-submit]');
  const downloadLink = modal.querySelector('[data-brochure-download]');

  // Close button
  modal.querySelector('.close').addEventListener('click', closeBrochure);

  // Cancel button
  modal.querySelector('[data-brochure-cancel]').addEventListener('click', closeBrochure);

  // Close success message
  modal.querySelector('[data-brochure-close-success]').addEventListener('click', () => {
    modal.querySelector('[data-brochure-success]').hidden = true;
    modal.querySelector('[data-brochure-form]').hidden = false;
    form.reset();
  });

  // Form submission
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    requestBrochure();
  });

  // Download link click handler
  downloadLink.addEventListener('click', (e) => {
    e.preventDefault();
    if (currentProgramId) {
      const url = getBrochureUrl(currentProgramId);
      if (url) {
        // Trigger download
        window.location.href = url;
        // Close modal after download starts
        setTimeout(() => {
          closeBrochure();
        }, 1000);
      }
    }
  });

  // Program change handler
  programSelect.addEventListener('change', (e) => {
    currentProgramId = e.target.value;
    if (currentProgramId) {
      const program = PROGRAMS.find(p => p.id === currentProgramId);
      if (program) {
        // Update success message area with program name
        const successMsg = modal.querySelector('[data-brochure-success]');
        if (successMsg) {
          successMsg.querySelector('[data-brochure-program-name]').textContent = program.name;
        }

        // Update download link
        const downloadLink = modal.querySelector('[data-brochure-download]');
        if (downloadLink) {
          downloadLink.href = getBrochureUrl(currentProgramId) || '#';
        }
      }
    }
  });

  // Escape key to close
  modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeBrochure(); });

  document.querySelector('[data-brochure-root]').append(modal);
}

async function requestBrochure() {
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const programId = programSelect.value;
  const program = PROGRAMS.find(p => p.id === programId);

  if (!program) return;

  // Hide form, show success message
  form.hidden = true;
  const successMsg = modal.querySelector('[data-brochure-success]');
  successMsg.querySelector('[data-brochure-program-name]').textContent = program.name;
  successMsg.hidden = false;

  // Update download link
  const downloadLink = modal.querySelector('[data-brochure-download]');
  if (downloadLink) {
    downloadLink.href = getBrochureUrl(programId) || '#';
  }
}

export function openBrochure({ programId } = {}) {
  if (!modal) build();

  // If a specific program is requested, pre-select it
  if (programId && programSelect) {
    programSelect.value = programId;
    currentProgramId = programId;

    // Trigger change event to load content
    const event = new Event('change');
    programSelect.dispatchEvent(event);
  }

  modal.hidden = false;
  document.body.classList.add('brochure-modal-open');

  // Focus on the first field
  programSelect.focus();
}

export function closeBrochure() {
  if (!modal) return;

  modal.hidden = true;
  document.body.classList.remove('brochure-modal-open');

  // Reset form
  if (form) {
    form.hidden = false;
    form.reset();
  }

  // Hide content and success areas
  const contentArea = modal.querySelector('[data-brochure-content]');
  const successArea = modal.querySelector('[data-brochure-success]');
  if (contentArea) contentArea.hidden = true;
  if (successArea) successArea.hidden = true;

  // Clear current program
  currentProgramId = null;

  // Return focus if we had it
  returnTo?.focus?.();
}