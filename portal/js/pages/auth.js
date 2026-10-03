// Sign-in pages: log in, create an account, forgot password, and choose a new password (from the email link).
import { auth, config, ApiError } from '../api.js';
import { html, icon, wordmark, envBanner, toast, $ } from '../ui.js';

const MIN_PASSWORD = 8;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function layout(card) {
  return html`${envBanner(config.environment)}
  <div class="auth">
    <div class="auth-l">
      <div class="auth-head"><div class="brand">${wordmark('/')}<small>Student portal</small></div><a class="small" href="/">Back to the website</a></div>
      <div class="auth-body">${card}</div>
      <div class="auth-foot"><span>© ${new Date().getFullYear()} Nuvora</span><nav class="row"><a href="/legal/privacy/">Privacy</a><a href="/legal/terms/">Terms</a><a href="/programs/">Programs</a></nav></div>
    </div>
    <div class="auth-r">
      <img src="../img/login-pro.jpg" alt="A professional woman in a blazer and glasses working on her laptop outside a modern office building" decoding="async">
      <div class="copy"><p>Your next chapter starts here.</p><span>Live classes, recorded lessons and real projects, all in one place.</span></div>
    </div>
  </div>`;
}

const passwordField = (id, label, autocomplete, extra = '') => html`
  <div class="field"><div class="flabel"><label for="${id}">${label}</label>${extra}</div>
    <div class="pw"><input id="${id}" type="password" autocomplete="${autocomplete}" required minlength="${MIN_PASSWORD}">
    <button type="button" data-eye="${id}" aria-label="Show password" aria-pressed="false">${icon('eye')}</button></div></div>`;

function wireEyes(form) {
  for (const b of form.querySelectorAll('[data-eye]')) {
    b.addEventListener('click', () => {
      const input = form.querySelector(`#${b.dataset.eye}`);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      b.innerHTML = String(icon(show ? 'eyeoff' : 'eye'));
      b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      b.setAttribute('aria-pressed', String(show));
    });
  }
}

function showError(form, message) {
  const el = form.querySelector('.formerr');
  el.textContent = message;
  el.hidden = !message;
  if (message) el.focus?.();
}

async function busy(button, label, fn) {
  const text = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try { return await fn(); } finally { button.disabled = false; button.textContent = text; }
}

// ---------------------------------------------------------------- log in
export function login(ctx) {
  ctx.root.innerHTML = String(layout(html`
    <form class="auth-card" novalidate data-form="login">
      <div><h1>Welcome back</h1><p class="sub">Log in to your Nuvora portal</p></div>
      ${ctx.flash ? html`<p class="okmsg" role="status">${ctx.flash}</p>` : ''}
      <p class="formerr" role="alert" tabindex="-1" hidden></p>
      <div class="field"><label for="email">Email address</label><input id="email" type="email" autocomplete="username" required></div>
      ${passwordField('password', 'Password', 'current-password', html`<a class="small" href="#/forgot">Forgot password?</a>`)}
      <label class="remember"><input type="checkbox" id="remember" checked> Keep me signed in on this device</label>
      <button class="btn primary big" type="submit">Log in</button>
      <div class="auth-links"><span class="muted">New to Nuvora? <a href="#/signup">Create an account</a></span></div>
      ${config.environment === 'local' ? html`<p class="small muted">Local test environment: sign in with a demo account listed in <span class="mono">server/demo-accounts.mjs</span>.</p>` : ''}
    </form>`));
  const form = $('[data-form="login"]', ctx.root);
  wireEyes(form);
  $('#email', form).focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#email', form).value.trim();
    const password = $('#password', form).value;
    if (!EMAIL.test(email)) return showError(form, 'Enter your email address, like name@example.com.');
    if (!password) return showError(form, 'Enter your password.');
    showError(form, '');
    try {
      await busy($('button[type=submit]', form), 'Logging in…', () => auth.signIn(email, password, $('#remember', form).checked));
      ctx.afterSignIn();
    } catch (err) {
      showError(form, err.code === 'invalid_credentials'
        ? 'That email and password don’t match. Try again, or reset your password.'
        : err.message);
    }
  });
}

// ---------------------------------------------------------------- create account
export function signup(ctx) {
  ctx.root.innerHTML = String(layout(html`
    <form class="auth-card" novalidate data-form="signup">
      <div><h1>Create your account</h1><p class="sub">One account for applications, classes and your portal</p></div>
      <p class="formerr" role="alert" tabindex="-1" hidden></p>
      <div class="field"><label for="name">Full name</label><input id="name" type="text" autocomplete="name" required maxlength="80"></div>
      <div class="field"><label for="email">Email address</label><input id="email" type="email" autocomplete="email" required></div>
      ${passwordField('password', 'Password', 'new-password')}
      <p class="small muted" style="margin-top:-10px">At least ${MIN_PASSWORD} characters.</p>
      ${passwordField('confirm', 'Confirm password', 'new-password')}
      <label class="remember"><input type="checkbox" id="agree"> <span>I agree to the <a href="/legal/terms/" target="_blank" rel="noopener">Terms</a> and <a href="/legal/privacy/" target="_blank" rel="noopener">Privacy Policy</a></span></label>
      <button class="btn primary big" type="submit">Create account</button>
      <div class="auth-links"><span class="muted">Already have an account? <a href="#/login">Log in</a></span></div>
    </form>`));
  const form = $('[data-form="signup"]', ctx.root);
  wireEyes(form);
  $('#name', form).focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#name', form).value.trim();
    const email = $('#email', form).value.trim();
    const password = $('#password', form).value;
    if (name.length < 2) return showError(form, 'Enter your full name.');
    if (!EMAIL.test(email)) return showError(form, 'Enter your email address, like name@example.com.');
    if (password.length < MIN_PASSWORD) return showError(form, `Choose a password of at least ${MIN_PASSWORD} characters.`);
    if (password !== $('#confirm', form).value) return showError(form, 'The two passwords don’t match.');
    if (!$('#agree', form).checked) return showError(form, 'Please agree to the Terms and Privacy Policy to continue.');
    showError(form, '');
    try {
      const { signedIn } = await busy($('button[type=submit]', form), 'Creating account…', () => auth.signUp(email, password, name));
      if (signedIn) { toast('Welcome to Nuvora!'); ctx.go('#/home'); return; }
      form.innerHTML = String(html`<div><h1>Check your inbox</h1><p class="sub">We sent a confirmation link to <b>${email}</b>. Open it to finish creating your account.</p></div>
        <a class="btn ghost" href="#/login">Back to log in</a>`);
    } catch (err) {
      showError(form, err.code === 'user_already_exists' ? 'An account with this email already exists. Try logging in instead.' : err.message);
    }
  });
}

// ---------------------------------------------------------------- forgot password
export function forgot(ctx) {
  ctx.root.innerHTML = String(layout(html`
    <form class="auth-card" novalidate data-form="forgot">
      <div><h1>Reset your password</h1><p class="sub">We’ll email you a link to choose a new one</p></div>
      ${ctx.flash ? html`<p class="formerr" role="alert">${ctx.flash}</p>` : ''}
      <p class="formerr" role="alert" tabindex="-1" hidden></p>
      <p class="okmsg" role="status" hidden></p>
      <div class="field"><label for="email">Email address</label><input id="email" type="email" autocomplete="email" required></div>
      <button class="btn primary big" type="submit">Send reset link</button>
      <div class="auth-links"><a href="#/login">Back to log in</a></div>
    </form>`));
  const form = $('[data-form="forgot"]', ctx.root);
  $('#email', form).focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#email', form).value.trim();
    if (!EMAIL.test(email)) return showError(form, 'Enter your email address, like name@example.com.');
    showError(form, '');
    try {
      await busy($('button[type=submit]', form), 'Sending…', () => auth.sendPasswordReset(email));
      const ok = $('.okmsg', form);
      ok.textContent = 'If an account exists for that email, a reset link is on its way. It works once and expires in 1 hour.';
      ok.hidden = false;
    } catch (err) {
      showError(form, err.message);
    }
  });
}

// ---------------------------------------------------------------- new password (after the email link)
export function reset(ctx) {
  ctx.root.innerHTML = String(layout(html`
    <form class="auth-card" novalidate data-form="reset">
      <div><h1>Choose a new password</h1><p class="sub">You’re signed in from your reset link</p></div>
      <p class="formerr" role="alert" tabindex="-1" hidden></p>
      ${passwordField('password', 'New password', 'new-password')}
      <p class="small muted" style="margin-top:-10px">At least ${MIN_PASSWORD} characters.</p>
      ${passwordField('confirm', 'Confirm new password', 'new-password')}
      <button class="btn primary big" type="submit">Save password</button>
    </form>`));
  const form = $('[data-form="reset"]', ctx.root);
  wireEyes(form);
  $('#password', form).focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = $('#password', form).value;
    if (password.length < MIN_PASSWORD) return showError(form, `Choose a password of at least ${MIN_PASSWORD} characters.`);
    if (password !== $('#confirm', form).value) return showError(form, 'The two passwords don’t match.');
    try {
      await busy($('button[type=submit]', form), 'Saving…', () => auth.updatePassword(password));
      toast('Password updated. You’re signed in.');
      ctx.go('#/home');
    } catch (err) {
      showError(form, err instanceof ApiError && err.status === 401 ? 'This reset link has expired. Request a new one.' : err.message);
    }
  });
}
