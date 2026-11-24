"use strict";
(function () {
  var main = document.querySelector("main"), reading = false, busy = false, loadingTimer = null;
  var view = document.createElement("section");
  view.className = "view tarot-view";
  view.id = "view-tarot";
  view.innerHTML = '<div class="tarot-hero"><div class="eyebrow">A QUESTION-LED CARD READING</div><h1>Pause. Ask. Draw.</h1><p>Choose a one, three, or seven card spread. Every question also draws one extra clarifier card, so the final card count is always one more than the spread you choose.</p><div class="tarot-note" id="tarotLimitNote">Two free Tarot questions per account. The cards offer a symbolic perspective, not a guaranteed prediction.</div></div><div class="tarot-layout"><form class="card tarot-form" id="tarotForm"><label class="tarot-label" for="tarotQuestion">What would you like insight on?</label><textarea id="tarotQuestion" minlength="5" maxlength="1000" required placeholder="Ask one clear question about the situation…"></textarea><div class="tarot-controls"><fieldset><legend>Choose a spread</legend><div class="tarot-spread-options"><label><input type="radio" name="spread" value="1"><span><b>1 card</b><small>One focused lens + clarifier</small></span></label><label><input type="radio" name="spread" value="3" checked><span><b>3 cards</b><small>Situation · challenge · guidance</small></span></label><label><input type="radio" name="spread" value="7"><span><b>7 cards</b><small>A deeper situation map + clarifier</small></span></label></div></fieldset><label class="tarot-language">Reading language<select id="tarotLanguage"><option value="en">English</option><option value="hi">Hindi</option><option value="hi-Latn">Hinglish</option></select></label></div><label class="tarot-ai-consent"><input id="tarotAiConsent" type="checkbox"><span>Use the configured AI reader for a more personal interpretation. If selected, your question and drawn card details, positions, and orientations are sent to the AI provider; no birth chart or birth details are sent.</span></label><button class="btn tarot-submit" id="tarotSubmit" type="submit">Draw my cards</button><p class="tarot-usage" id="tarotUsage" role="status">Sign in to use your two free Tarot questions.</p><p class="tarot-safety">For health, safety, legal, or financial concerns, use qualified real-world support. Tarot cannot establish facts about another person or guarantee what will happen.</p></form><div class="tarot-result" id="tarotResult" aria-live="polite"><div class="tarot-empty"><span class="tarot-empty-star">✦</span><h2>Your cards will appear here</h2><p>Your spread will show each card, its position, orientation, and how it relates to the question.</p></div></div></div>';
  main.appendChild(view);

  var topNav = document.getElementById("topNav");
  var topButton = document.createElement("button"); topButton.type = "button"; topButton.dataset.v = "tarot"; topButton.textContent = "Tarot";
  var reportsButton = topNav.querySelector('[data-v="reports"]');
  topNav.insertBefore(topButton, reportsButton || null);
  var bottomNav = document.getElementById("bottomNav");
  var bottomButton = document.createElement("button"); bottomButton.type = "button"; bottomButton.dataset.v = "tarot"; bottomButton.textContent = "Tarot";
  var bottomPlans = bottomNav.querySelector('[data-v="billing"]');
  bottomNav.insertBefore(bottomButton, bottomPlans || null);

  var verdictNames = {YES:"Yes", NO:"No", MAYBE:"Maybe", POSSIBLE:"Possibly"};
  function safe(value) { return typeof esc === "function" ? esc(value) : String(value || ""); }
  function spreadSize() { return Number(view.querySelector('input[name="spread"]:checked').value); }
  function renderPreview() {
    var size = spreadSize();
    var positions = size === 1
      ? ["Your focus", "Clarifier"]
      : size === 3
        ? ["Situation", "Challenge", "Guidance", "Clarifier"]
        : ["Context", "Root", "Past", "Present", "Challenge", "Direction", "Guidance", "Clarifier"];
    var backs = positions.map(function (position, index) {
      var clarifier = position === "Clarifier";
      return '<div class="tarot-back-card ' + (clarifier ? "is-clarifier" : "") + '" aria-hidden="true" style="--card-index:' + index + '"><div class="tarot-back-frame"><span class="tarot-back-star">✦</span><span class="tarot-back-moon">☾</span><span class="tarot-back-symbol">✧</span><span class="tarot-back-position">' + safe(position) + '</span></div></div>';
    }).join("");
    document.getElementById("tarotResult").innerHTML = '<section class="tarot-preview"><div class="tarot-preview-top"><span class="eyebrow">THE DECK IS READY</span><span class="tarot-preview-count">' + positions.length + ' cards</span></div><h2>Your spread</h2><p>Take a breath and focus on your question. Your selected cards and one extra clarifier will appear here.</p><div class="tarot-back-grid">' + backs + '</div><div class="tarot-preview-foot"><span aria-hidden="true">✦</span> One extra clarifier is drawn with every question</div></section>';
    var preview = view.querySelector(".tarot-preview");
    preview.addEventListener("pointermove", function (event) {
      var rect = preview.getBoundingClientRect();
      preview.style.setProperty("--pointer-x", ((event.clientX - rect.left) / rect.width * 100).toFixed(1) + "%");
      preview.style.setProperty("--pointer-y", ((event.clientY - rect.top) / rect.height * 100).toFixed(1) + "%");
      var card = event.target.closest(".tarot-back-card");
      if (!card) return;
      var cardRect = card.getBoundingClientRect();
      var x = (event.clientX - cardRect.left) / cardRect.width - .5;
      var y = (event.clientY - cardRect.top) / cardRect.height - .5;
      card.style.setProperty("--tilt-x", (x * 13).toFixed(1) + "deg");
      card.style.setProperty("--tilt-y", (-y * 13).toFixed(1) + "deg");
    });
    preview.addEventListener("pointerleave", function () {
      preview.style.removeProperty("--pointer-x");
      preview.style.removeProperty("--pointer-y");
      preview.querySelectorAll(".tarot-back-card").forEach(function (card) {
        card.style.removeProperty("--tilt-x");
        card.style.removeProperty("--tilt-y");
      });
    });
  }
  renderPreview();
  view.querySelectorAll('input[name="spread"]').forEach(function (input) {
    input.addEventListener("change", function () {
      if (!reading && !busy) renderPreview();
    });
  });
  function renderUsage(usage) {
    var message = usage.unlimited
      ? "Unlimited Tarot questions on your administrator account."
      : usage.free_remaining > 0
        ? usage.free_used + " of " + usage.free_limit + " free Tarot questions used · " + usage.free_remaining + " remaining"
        : "You have used both free Tarot questions on this account.";
    document.getElementById("tarotUsage").textContent = message;
    document.getElementById("tarotLimitNote").textContent = usage.unlimited
      ? "Unlimited Tarot readings for administrators. The cards offer a symbolic perspective, not a guaranteed prediction."
      : "Two free Tarot questions per account. The cards offer a symbolic perspective, not a guaranteed prediction.";
    document.getElementById("tarotSubmit").disabled = busy || (!usage.unlimited && usage.free_remaining < 1);
  }
  async function updateUsage() {
    try {
      var state = await api("/api/auth/me");
      var usage = state.tarot || {free_limit:2, free_used:0, free_remaining:2};
      renderUsage(usage);
      return usage;
    } catch (_) {
      document.getElementById("tarotUsage").textContent = "Sign in to use your two free Tarot questions.";
      document.getElementById("tarotSubmit").disabled = true;
      return null;
    }
  }
  function renderResult(data, usedAiConsent) {
    reading = true;
    var cards = data.cards || [], answer = data.reading || {};
    var title = verdictNames[answer.verdict] || "Maybe";
    if (data.language === "hi") title = {YES:"हाँ",NO:"नहीं",MAYBE:"शायद",POSSIBLE:"संभव"}[answer.verdict] || title;
    if (data.language === "hi-Latn") title = {YES:"Haan",NO:"Nahi",MAYBE:"Shayad",POSSIBLE:"Sambhav"}[answer.verdict] || title;
    var cardsHtml = cards.map(function (card, index) {
      var reversal = card.orientation === "reversed";
      return '<article class="tarot-card ' + (reversal ? "is-reversed" : "") + '" aria-label="' + safe(card.name + ", " + card.position + ", " + card.orientation) + '" style="--card-index:' + index + '"><div class="tarot-card-number">' + safe(card.number) + '</div><div class="tarot-card-artwork" aria-hidden="true"><img class="tarot-card-image" src="' + safe(card.image) + '" alt="" loading="lazy" decoding="async"></div><h3>' + safe(card.name) + '</h3><div class="tarot-card-position">' + safe(card.position) + '</div><div class="tarot-orientation ' + (reversal ? "reversed" : "") + '">' + (reversal ? "Reversed" : "Upright") + '</div></article>';
    }).join("");
    var interpretations = (answer.card_readings || []).map(function (item) {
      var readingLabel = [item.card_name, item.position, item.orientation].filter(Boolean).join(" · ");
      return '<article class="tarot-reading-card"><div class="eyebrow">' + safe(readingLabel || item.position) + '</div><p>' + safe(item.text) + '</p></article>';
    }).join("");
    var deliveryNote = answer.engine === "ai"
      ? "Your question and drawn card details were processed by the configured AI reader. Birth details were not sent."
      : data.ai_attempted
        ? "The AI reader could not complete the response, so a built-in interpretation is shown. Your question may have reached the configured AI provider; birth details were not sent."
        : usedAiConsent && !data.ai_available
          ? "The configured AI reader is unavailable, so this uses the built-in card interpretation. Your question was not sent to an AI provider."
          : "Built-in card interpretation used. Your question was not sent to an AI provider.";
    document.getElementById("tarotResult").innerHTML = '<div class="tarot-answer"><div class="tarot-verdict"><span class="eyebrow">THE SPREAD LEANS</span><strong>' + safe(title) + '</strong></div><p class="tarot-summary">' + safe(answer.summary) + '</p></div><div class="tarot-cards-grid">' + cardsHtml + '</div><div class="tarot-interpretations"><h2>What each card adds</h2>' + interpretations + '</div><article class="tarot-synthesis"><h2>How the spread fits together</h2><p>' + safe(answer.synthesis) + '</p><h3>A grounded next step</h3><p>' + safe(answer.next_step) + '</p></article><p class="tarot-ai-note">' + safe(deliveryNote) + '</p><p class="tarot-disclaimer">' + safe(data.note) + '</p><p class="tarot-art-credit">Card artwork: Pamela Colman Smith, Rider–Waite–Smith Tarot (1909), public-domain scans via Wikimedia Commons.</p>';
  }

  async function openTarot() {
    await showView("tarot");
    await updateUsage();
    document.getElementById("tarotQuestion").focus({preventScroll:true});
  }
  topButton.addEventListener("click", openTarot);
  bottomButton.addEventListener("click", openTarot);
  var form = document.getElementById("tarotForm");
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (busy) return;
    var question = document.getElementById("tarotQuestion").value.trim();
    if (question.length < 5) return;
    busy = true;
    reading = false;
    var button = document.getElementById("tarotSubmit");
    button.disabled = true; button.textContent = "Shuffling your spread…";
    document.getElementById("tarotResult").innerHTML = '<div class="tarot-empty is-loading"><div class="tarot-loading-mark" aria-hidden="true"><span class="tarot-loading-ring"></span><span class="tarot-empty-star">✦</span></div><h2 id="tarotLoadingTitle">Shuffling the deck…</h2><p>Your spread and extra clarifier are being drawn.</p><div class="tarot-loading-track" role="progressbar" aria-label="Tarot reading in progress"><span></span></div><div class="tarot-loading-dots" aria-hidden="true"><i></i><i></i><i></i></div></div>';
    var loadingMessages = ["Shuffling the deck…", "Drawing your spread…", "Preparing your reading…"];
    var loadingStep = 0;
    clearInterval(loadingTimer);
    loadingTimer = window.setInterval(function () {
      loadingStep = (loadingStep + 1) % loadingMessages.length;
      var title = document.getElementById("tarotLoadingTitle");
      if (title) title.textContent = loadingMessages[loadingStep];
    }, 2100);
    var aiConsent = document.getElementById("tarotAiConsent").checked;
    try {
      var result = await api("/api/tarot/read", {question:question, spread:spreadSize(), language:document.getElementById("tarotLanguage").value, ai_consent:aiConsent});
      renderResult(result, aiConsent);
      document.getElementById("tarotQuestion").value = "";
      if (window.NuvoraAccount) window.NuvoraAccount.refresh();
      renderUsage(result.usage);
    } catch (error) {
      document.getElementById("tarotResult").innerHTML = '<div class="tarot-error" role="alert">' + safe(error.message || "Your reading could not be completed. Try again.") + '</div>';
      await updateUsage();
    } finally {
      clearInterval(loadingTimer);
      loadingTimer = null;
      busy = false;
      button.textContent = "Draw my cards";
      await updateUsage();
    }
  });
  document.querySelectorAll('[data-v="tarot"]').forEach(function (button) {
    if (button !== topButton && button !== bottomButton) button.addEventListener("click", openTarot);
  });
})();
