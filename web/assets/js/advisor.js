// The advisor panel: a small chat dialog opened from the floating "AI Advisor" pill (desktop) or the "Ask AI"
// bar (phones). Loaded on first use.
import { CATALOG } from './catalog.mjs';
import { aiAvailable, aiAnswer, catalogAnswer, renderAnswer } from './advisor-engine.mjs';

const SUGGESTIONS = ['Which program fits me?', 'How much does it cost?', 'When is the next start?', 'Is it an accredited degree?', 'Can I download videos?'];
const SPARK = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';
const X = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12 M18 6L6 18"/></svg>';

let panel, log, input, returnTo;
const history = [];

function add(who, text, { html = false } = {}) {
  const el = document.createElement('div');
  el.className = `msg ${who}`;
  if (html) el.innerHTML = renderAnswer(text); else el.textContent = text;
  log.append(el);
  log.scrollTop = log.scrollHeight;
  history.push({ who, text });
  return el;
}

async function ask(text) {
  const q = text.trim().slice(0, 500);
  if (!q) return;
  add('me', q);
  input.value = '';
  const ai = aiAvailable();
  let reply;
  if (ai) {
    const thinking = document.createElement('div');
    thinking.className = 'msg bot';
    thinking.textContent = 'Thinking…';
    log.append(thinking);
    try { reply = await aiAnswer(history, CATALOG); } catch { reply = null; }
    thinking.remove();
    if (!reply) reply = catalogAnswer(q, CATALOG);
  } else {
    reply = catalogAnswer(q, CATALOG);
  }
  add('bot', reply, { html: true });
}

function build() {
  const ai = aiAvailable();
  panel = document.createElement('section');
  panel.className = 'advisor';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'advisor-title');
  panel.innerHTML = `
    <header><span class="ai-dot">${SPARK}</span><div><b id="advisor-title">${ai ? 'Nuvora AI Advisor' : 'Ask Nuvora'}</b>
      <small>${ai ? 'AI answers from our catalog · can be wrong' : 'Answers from our published catalog · no AI on this site yet'}</small></div>
      <button class="x" type="button" aria-label="Close advisor">${X}</button></header>
    <div class="log" aria-live="polite"></div>
    <div class="sugg">${SUGGESTIONS.map((s) => `<button type="button">${s}</button>`).join('')}</div>
    <form autocomplete="off"><label class="sr-only" for="advisor-in">Your question</label><input id="advisor-in" type="text" maxlength="500" enterkeyhint="send" placeholder="Ask about programs, dates, fees…"><button class="btn primary sm" type="submit">Send</button></form>
    <p class="legal">Please don’t share personal or sensitive information here.${ai ? ' Questions are sent to an AI model to answer.' : ''} <a href="/legal/privacy/">Privacy</a></p>`;
  log = panel.querySelector('.log');
  input = panel.querySelector('input');
  add('bot', `Hi! I can help you choose a program and answer questions about dates, tuition, the live schedule and the credential. [Find my program](/find-your-program/) is the quickest way to a match.`, { html: true });
  panel.querySelector('.x').addEventListener('click', closeAdvisor);
  panel.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
  panel.querySelector('.sugg').addEventListener('click', (e) => { if (e.target.matches('button')) ask(e.target.textContent); });
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAdvisor(); });
  document.querySelector('[data-advisor-root]').append(panel);
}

export function openAdvisor({ returnFocus, prompt } = {}) {
  returnTo = returnFocus ?? document.activeElement;
  if (!panel) build();
  panel.hidden = false;
  document.body.classList.add('advisor-open');
  // Only focus the text field on devices with a fine pointer, so phones do not pop the keyboard over the answers.
  if (matchMedia('(pointer: fine)').matches) input.focus(); else panel.querySelector('.x').focus();
  if (prompt) ask(prompt);
}

export function closeAdvisor() {
  panel.hidden = true;
  document.body.classList.remove('advisor-open');
  returnTo?.focus?.();
}
