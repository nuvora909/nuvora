"use strict";
(function () {
  var root = document.getElementById("accountRoot");
  var main = document.querySelector("main");
  var authMode = "signup", accountState = null, billingOptions = null, billingMessage = "";

  root.innerHTML = '<section class="auth-shell" id="authGate"><div class="auth-story"><div class="brand auth-brand-mobile"><span class="mark" aria-hidden="true"></span>Nuvora <small>Jyotish</small></div><div class="eyebrow">A clearer view of your sky</div><h1>Your chart.<br><em>Thoughtfully read.</em></h1><p>Explore your Vedic chart with precise calculations and answers checked against the chart itself.</p><div class="auth-benefits"><span><i class="auth-check">✓</i>Two complimentary questions to begin</span><span><i class="auth-check">✓</i>Your kundlis are stored in this browser</span><span><i class="auth-check">✓</i>Simple one-time passes, no auto-renewal</span></div></div><div class="auth-card"><div class="brand auth-brand-mobile"><span class="mark" aria-hidden="true"></span>Nuvora <small>Jyotish</small></div><div class="eyebrow">YOUR PRIVATE ASTROLOGY SPACE</div><h2 id="authTitle">Create your account</h2><p class="sub" id="authSubtitle">Start with two free questions. No card needed.</p><form id="authForm"><label>Email address<input id="authEmail" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com"></label><label>Password<input id="authPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="128" placeholder="At least 12 characters"></label><label id="regionLabel">Billing region<select id="authRegion"><option value="IN">India · INR</option><option value="GB">UK / International · GBP</option></select></label><button class="btn full" id="authSubmit" type="submit">Create free account</button><div class="auth-error" id="authError" role="alert"></div></form><button class="auth-switch" id="authSwitch" type="button">Already have an account? Sign in</button><p class="auth-note">Your password is stored as a salted hash. Account email and question usage are stored on the server; saved birth charts are stored in this browser. Chart calculations are processed by this service. AI processing is optional and chosen per chart. Do not reuse a password.</p></div></section>';

  var authCard = root.querySelector(".auth-card");
  authCard.querySelector(".auth-note").insertAdjacentHTML("beforebegin", '<div class="google-auth-panel" id="googleAuthPanel" hidden><div class="eyebrow">CONTINUE WITH GOOGLE</div><p class="sub">Use your Google account to create or access your Nuvora account securely.</p><div id="googleSignInButton"></div><div class="auth-error" id="googleAuthMessage" role="status"></div></div>');

  var dashboard = document.createElement("section");
  dashboard.className = "view account-dashboard";
  dashboard.id = "view-dashboard";
  dashboard.innerHTML = '<div class="dash-hero"><div class="cosmic-visual" aria-hidden="true"><div class="cosmic-topline"><span>PERSONAL SKY ATLAS</span><i></i></div><img class="dashboard-map" src="/static/celestial-map.svg" alt=""><div class="cosmic-caption"><b>One chart. Many dimensions.</b><span>D1 · D9 · D10 · DASHA CYCLES</span></div></div><div class="dash-welcome"><div class="eyebrow">YOUR COSMIC WORKSPACE</div><h1>Your sky, in focus.</h1><p>A calm home for your chart, saved Kundli, and readings. One saved Kundli is included; add extra charts with a one-time slot.</p><div class="dash-actions"><button class="btn" type="button" data-account-action="new-chart">＋ Create a kundli</button><button class="btn ghost" type="button" data-v="chat">Go to chat</button></div></div><div class="card account-id-card"><div><div class="eyebrow">SIGNED IN AS</div><b class="email" id="dashEmail"></b></div><div><span class="plan-chip" id="dashPlan">Free account</span><div class="meta" id="dashExpiry"></div><a class="admin-link" id="adminLink" href="/admin" hidden>Open admin dashboard →</a></div><button class="btn ghost signout" type="button" data-account-action="logout">Sign out</button></div></div><div class="account-grid"><article class="card account-tile"><div class="eyebrow">FREE QUESTIONS</div><div class="usage-number" id="freeRemaining">2</div><div class="usage-track"><i id="usageBar" style="width:0%"></i></div><h3 id="usageTitle">Your first two are on us</h3><p id="usageCopy">Ask about your chart, career, timing, or relationships.</p><button class="btn ghost" type="button" data-v="billing">See plans</button></article><article class="card account-tile"><div class="eyebrow">YOUR CHARTS</div><h3 id="chartCount">No kundlis yet</h3><p>One saved Kundli is included with your account. Extra saved charts are available as one-time add-ons.</p><button class="btn ghost" type="button" data-v="profile">Manage kundlis</button></article><article class="card account-tile"><div class="eyebrow">MEMBERSHIP</div><h3 id="membershipTitle">Choose when you are ready</h3><p id="membershipCopy">Unlock detailed Kundli sections, core PDF downloads and unlimited questions with a one-time week, six-month, or annual pass. No pass renews automatically.</p><button class="btn ghost" type="button" data-v="billing">View membership</button></article></div>';
  main.insertBefore(dashboard, main.firstChild);

  var billing = document.createElement("section");
  billing.className = "view billing-view";
  billing.id = "view-billing";
  billing.innerHTML = '<div class="eyebrow">MEMBERSHIP · NO AUTO-RENEWAL</div><h1>Keep the conversation going.</h1><p class="billing-lead">Choose a one-time pass for detailed Kundli sections, core PDF downloads and unlimited chat: seven days, six calendar months, or twelve months. Specialized standalone reports remain separate purchases.</p><div class="billing-region" id="billingRegion"></div><div class="pricing-grid" id="pricingGrid"></div><div class="card billing-notice" id="billingNotice"></div><div class="purchase-terms" id="purchaseTerms"></div><div class="billing-message" id="billingMessage" role="status"></div><div class="card paypal-frame" id="paypalFrame" hidden><div class="eyebrow">SECURE CHECKOUT</div><p class="muted" id="paypalHint">Complete your payment with PayPal.</p><div id="paypalButtons"></div></div><p class="billing-footnote">Prices are fixed by the server and checked again when payment is captured. Passes are one-time purchases and do not start a recurring subscription.</p>';
  main.appendChild(billing);

  var topNav = document.getElementById("topNav");
  topNav.insertAdjacentHTML("afterbegin", '<button data-v="dashboard">Home</button>');
  topNav.insertAdjacentHTML("beforeend", '<button data-v="billing">Plans</button>');
  var bottomNav = document.getElementById("bottomNav");
  bottomNav.innerHTML = '<button data-v="dashboard">Home</button><button data-v="chat">Chat</button><button data-v="kundli">Kundli</button><button data-v="profile">Saved</button><button data-v="billing">Plans</button>';

  var authForm = document.getElementById("authForm");
  var authSwitch = document.getElementById("authSwitch");
  var authError = document.getElementById("authError");
  var authSubmit = document.getElementById("authSubmit");
  var googleAuthPanel = document.getElementById("googleAuthPanel"), googleClientId = null;
  var googleSdkPromise = null;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return {"&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;"}[c];
    });
  }
  function planLabel(key) {
    return {week:"Weekly pass", six_months:"Six-month pass", year:"Annual pass", month:"Month pass", annual:"Annual pass", admin:"Administrator"}[key] || "Pass";
  }
  function migrateLegacyCharts(userId) {
    var prefix = "nuvora.account." + String(userId) + ".";
    if (localStorage.getItem("nuvora.legacy-migrated.v2") !== "1") {
      var oldCharts = localStorage.getItem("nuvora.kundlis");
      var oldCurrent = localStorage.getItem("nuvora.current");
      if (oldCharts && !localStorage.getItem(prefix + "kundlis")) localStorage.setItem(prefix + "kundlis", oldCharts);
      if (oldCurrent && !localStorage.getItem(prefix + "current")) localStorage.setItem(prefix + "current", oldCurrent);
      localStorage.removeItem("nuvora.kundlis");
      localStorage.removeItem("nuvora.current");
      localStorage.setItem("nuvora.legacy-migrated.v2", "1");
    }
    window.NUVORA_ACCOUNT_ID = String(userId);
  }
  function setSignedOut() {
    document.body.classList.remove("auth-pending");
    document.body.classList.add("signed-out");
    root.style.display = "block";
  }
  function showAuthMode(keepError) {
    var signup = authMode === "signup";
    document.getElementById("authTitle").textContent = signup ? "Create your account" : "Welcome back";
    document.getElementById("authSubtitle").textContent = signup ? "Start with two free questions. No card needed." : "Sign in to return to your chart workspace.";
    document.getElementById("authSubmit").textContent = signup ? "Create free account" : "Sign in";
    document.getElementById("authPassword").autocomplete = signup ? "new-password" : "current-password";
    document.getElementById("authPassword").minLength = signup ? 12 : 1;
    document.getElementById("regionLabel").hidden = !signup;
    googleAuthPanel.hidden = !googleClientId;
    authSwitch.textContent = signup ? "Already have an account? Sign in" : "New to Nuvora? Create an account";
    if (!keepError) authError.textContent = "";
  }
  authSwitch.addEventListener("click", function () { authMode = authMode === "signup" ? "login" : "signup"; showAuthMode(); });
  authForm.addEventListener("submit", async function (event) {
    event.preventDefault(); authError.textContent = ""; authSubmit.disabled = true;
    authSubmit.textContent = authMode === "signup" ? "Creating account…" : "Signing in…";
    var payload = {email: document.getElementById("authEmail").value.trim(), password: document.getElementById("authPassword").value};
    if (authMode === "signup") payload.country_code = document.getElementById("authRegion").value;
    try { await api("/api/auth/" + authMode, payload); window.location.reload(); }
    catch (error) {
      authError.textContent = error.message || "Could not continue. Please try again.";
      if (authMode === "login") document.getElementById("authPassword").select();
    }
    // Restore the button label but keep the error visible until the visitor retries or switches mode.
    finally { authSubmit.disabled = false; showAuthMode(true); }
  });

  function loadGoogleSdk() {
    if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve();
    if (googleSdkPromise) return googleSdkPromise;
    googleSdkPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client"; script.async = true; script.defer = true;
      script.onload = resolve;
      script.onerror = function () { googleSdkPromise = null; reject(new Error("Google sign-in could not load.")); };
      document.head.appendChild(script);
    });
    return googleSdkPromise;
  }
  function handleGoogleCredential(response) {
    var message = document.getElementById("googleAuthMessage");
    message.textContent = "Verifying Google sign-in?";
    api("/api/auth/google", {credential: response.credential}).then(function () { window.location.reload(); })
      .catch(function (error) { message.textContent = error.message || "Google sign-in could not be verified."; });
  }
  async function renderGoogleButton() {
    if (!googleClientId || !googleAuthPanel || !googleAuthPanel.offsetParent) return;
    await loadGoogleSdk();
    googleAuthPanel.hidden = false;
    document.getElementById("googleSignInButton").innerHTML = "";
    window.google.accounts.id.initialize({client_id: googleClientId, callback: handleGoogleCredential});
    window.google.accounts.id.renderButton(document.getElementById("googleSignInButton"), {
      theme: "filled_blue", size: "large", shape: "pill", text: "continue_with", width: "100%"
    });
  }

  async function refresh() {
    var state = await api("/api/auth/me"); accountState = state; migrateLegacyCharts(state.user.id);
    var isAdmin = !!state.user.is_admin;
    document.getElementById("deleteAccountButton").hidden = isAdmin;
    document.getElementById("adminLink").hidden = !isAdmin;
    document.getElementById("dashEmail").textContent = state.user.email;
    var remaining = state.usage.free_remaining;
    document.getElementById("freeRemaining").textContent = isAdmin ? "?" : String(remaining);
    document.getElementById("usageBar").style.width = isAdmin ? "100%" : (state.usage.free_used / state.usage.free_limit * 100) + "%";
    document.getElementById("usageTitle").textContent = isAdmin ? "Unlimited questions enabled" : remaining ? "Your first two are on us" : "Your free questions are used";
    document.getElementById("usageCopy").textContent = isAdmin ? "Administrator access includes all premium readings and unlimited questions." : remaining ? "Ask about your chart, career, timing, or relationships." : "Choose a one-time pass to continue asking questions.";
    var charts = state.kundlis || {used: 0, slots: 1};
    document.getElementById("chartCount").textContent = isAdmin ? charts.used + " saved Kundlis · extra slots available" : charts.used + " of " + charts.slots + " saved Kundli slots used";
    var plan = state.subscription;
    document.getElementById("dashPlan").textContent = isAdmin ? "Administrator" : plan.active ? planLabel(plan.plan) + " active" : "Free account";
    document.getElementById("membershipTitle").textContent = isAdmin ? "Full access enabled" : plan.active ? "Your pass is active" : "Choose when you are ready";
    document.getElementById("membershipCopy").textContent = isAdmin ? "This account has all features, unlimited questions, and unlimited saved Kundlis." : plan.active ? "Your access is active through the date shown. It will not renew automatically." : "Unlock detailed Kundli sections, core PDF downloads and unlimited questions with a one-time week, six-month, or annual pass. No pass renews automatically.";
    document.getElementById("dashExpiry").textContent = isAdmin ? "Administrator access · no expiry" : plan.active ? "Access through " + new Date(plan.expires_at).toLocaleDateString() : plan.expires_at ? "Pass ended " + new Date(plan.expires_at).toLocaleDateString() : "Two free questions included";
    return state;
  }
  function navigate(view) {
    showView(view);
    if (view === "dashboard") refresh().catch(function () {});
    if (view === "billing") loadBilling().catch(function (error) { document.getElementById("billingMessage").textContent = error.message; });
  }
  topNav.querySelector('[data-v="dashboard"]').addEventListener("click", function () { navigate("dashboard"); });
  topNav.querySelector('[data-v="billing"]').addEventListener("click", function () { navigate("billing"); });
  bottomNav.querySelectorAll("[data-v]").forEach(function (button) { button.addEventListener("click", function () { navigate(button.dataset.v); }); });
  document.addEventListener("click", async function (event) {
    var viewButton = event.target.closest("#view-dashboard [data-v]");
    if (viewButton) { navigate(viewButton.dataset.v); return; }
    var action = event.target.closest("[data-account-action]");
    if (!action) return;
    if (action.dataset.accountAction === "new-chart") openBirth();
    if (action.dataset.accountAction === "logout") {
      action.disabled = true;
      try { await api("/api/auth/logout", {}); } catch (_) {}
      window.location.reload();
    }
    if (action.dataset.accountAction === "delete-account") {
      if (!window.confirm("Permanently delete your Nuvora account, saved birth details on this device, report access, and account records? This cannot be undone.")) return;
      var phrase = window.prompt('Type DELETE MY ACCOUNT to confirm permanent deletion.');
      if (phrase !== "DELETE MY ACCOUNT") return;
      action.disabled = true;
      var status = document.getElementById("deleteAccountStatus");
      status.textContent = "Deleting your account and saved data…";
      try {
        await api("/api/auth/account", {confirmation: phrase}, {method:"DELETE"});
        var prefix = "nuvora.account." + String(window.NUVORA_ACCOUNT_ID || "") + ".";
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var key = localStorage.key(i);
          if (key && key.indexOf(prefix) === 0) localStorage.removeItem(key);
        }
        window.NUVORA_ACCOUNT_ID = null;
        window.location.reload();
      } catch (error) {
        status.textContent = error.message || "The account could not be deleted. Please try again.";
        action.disabled = false;
      }
    }
  });

  function renderBilling(options) {
    billingOptions = options;
    var region = options.region;
    var upi = region.country_code === "IN" && options.payment.upi_available;
    var regionName = region.country_code === "IN" ? "India · INR" : "UK / international · GBP";
    document.getElementById("billingRegion").innerHTML = '<span class="chip gold">' + escapeHtml(regionName) + '</span><span>Region source: ' + escapeHtml(region.source) + '</span><span>Prices are one-time; no automatic renewal.</span>';
    var terms = options.purchase_terms || {};
    if (terms.support_email) document.querySelectorAll("[data-support-email]").forEach(function (link) {
      link.textContent = terms.support_email; link.href = "mailto:" + terms.support_email;
    });
    var support = terms.support_email ? '<p>Refund or cancellation requests: <a href="mailto:' + escapeHtml(terms.support_email) + '?subject=Refund%20or%20cancellation%20request">' + escapeHtml(terms.support_email) + '</a>. Include your order ID if available.</p>' : '<p>Refund requests are not available yet because no support contact has been published.</p>';
    document.getElementById("purchaseTerms").innerHTML = '<h2>Delivery, refunds &amp; support</h2><p>' + escapeHtml(terms.delivery || "Digital access is provided after payment verification.") + '</p><p><strong>Refund and cancellation terms:</strong> ' + escapeHtml(terms.published ? terms.refund_policy : "Not published yet. Checkout remains disabled until the policy and support contact are published.") + '</p>' + support;
    var grid = document.getElementById("pricingGrid");
    var plansHtml = options.plans.map(function (plan) {
      var enabled = (options.payment.paypal_available || upi) && plan.can_purchase;
      var buttonText = !plan.can_purchase ? "Longer pass already active" : upi ? "Pay with UPI" : enabled ? "Continue with PayPal" : "Purchases opening soon";
      return '<article class="card price-card ' + (plan.featured ? "featured" : "") + '"><div class="eyebrow">' + escapeHtml(plan.eyebrow || (plan.intro ? "INTRODUCTORY PASS" : "ONE-TIME PASS")) + '</div><h2>' + escapeHtml(plan.name) + '</h2><div class="price">' + escapeHtml(plan.price) + '</div><div class="term">' + escapeHtml(plan.term) + ' · one-time payment</div><ul><li>Unlimited chart questions during your pass</li><li>Detailed Kundli sections and core PDF downloads</li><li>No auto-renewal or surprise charges</li></ul><button class="btn ' + (plan.featured ? "" : "ghost") + '" type="button" data-plan="' + escapeHtml(plan.key) + '" ' + (enabled ? "" : "disabled") + '>' + escapeHtml(buttonText) + '</button></article>';
    }).join("");
    var addon = (options.addons || [])[0], addonEnabled = !!(addon && (options.payment.paypal_available || upi));
    var addonText = upi ? "Add one saved Kundli with UPI" : addonEnabled ? "Add one saved Kundli" : "Purchases opening soon";
    var addonHtml = addon ? '<article class="card price-card addon-card"><div class="eyebrow">ONE-TIME CHART ADD-ON</div><h2>' + escapeHtml(addon.name) + '</h2><div class="price">' + escapeHtml(addon.price) + '</div><div class="term">' + escapeHtml(addon.term) + '</div><ul><li>Adds one saved-chart slot to your account</li><li>Does not change or renew your membership</li><li>Price is fixed and verified by the server</li></ul><button class="btn ghost" type="button" data-addon="kundli_slot" ' + (addonEnabled ? "" : "disabled") + '>' + escapeHtml(addonText) + '</button></article>' : '';
    grid.innerHTML = plansHtml + addonHtml;
    var note = document.getElementById("billingNotice");
    if (!terms.published) note.innerHTML = '<strong>Purchases are opening soon.</strong> Refund terms and a support contact must be published before checkout can open.';
    else if (region.country_code === "IN") note.innerHTML = '<strong>' + (upi ? 'Secure UPI checkout.' : 'Purchases are opening soon.') + '</strong> ' + escapeHtml(options.payment.upi_message || "Checkout will appear here when it is ready.");
    else if (!options.payment.paypal_available) note.innerHTML = '<strong>Purchases are opening soon.</strong> Payment setup is not complete for this region.';
    else note.innerHTML = '<strong>Secure payment:</strong> PayPal creates and captures orders on the server. Passes and chart-slot add-ons activate only after the amount and currency are verified.';
    document.getElementById("billingMessage").textContent = billingMessage;
    grid.querySelectorAll("[data-plan]").forEach(function (button) { button.addEventListener("click", function () { startPayPal(button.dataset.plan, "pass"); }); });
    var addonButton = grid.querySelector("[data-addon]");
    if (addonButton) addonButton.addEventListener("click", function () { startPayPal("week", "kundli_slot"); });
  }
  async function loadBilling() { var options = await api("/api/billing/options"); renderBilling(options); }
  function loadPayPalSdk(clientId) {
    if (window.paypal) return Promise.resolve();
    if (window.nuvoraPaypalLoading) return window.nuvoraPaypalLoading;
    window.nuvoraPaypalLoading = new Promise(function (resolve, reject) {
      var script = document.createElement("script"), url = new URL("https://www.paypal.com/sdk/js");
      url.searchParams.set("client-id", clientId); url.searchParams.set("currency", "GBP"); url.searchParams.set("intent", "capture"); url.searchParams.set("components", "buttons");
      script.src = url.toString(); script.onload = resolve; script.onerror = function () { reject(new Error("PayPal checkout could not load.")); };
      document.head.appendChild(script);
    });
    return window.nuvoraPaypalLoading;
  }
  async function startPayPal(plan, purchaseType) {
    purchaseType = purchaseType || "pass";
    var isAddon = purchaseType === "kundli_slot";
    billingMessage = "Connecting secure checkout…"; document.getElementById("billingMessage").textContent = billingMessage;
    var frame = document.getElementById("paypalFrame"), buttons = document.getElementById("paypalButtons");
    try {
      var options = billingOptions || await api("/api/billing/options");
      if (options.region.country_code === "IN") {
        if (!options.payment.upi_available) throw new Error(options.payment.upi_message);
        frame.hidden = true;
        await window.NuvoraYoupi.start(isAddon ? "kundli_slot" : "pass", plan);
        return;
      }
      frame.hidden = false; buttons.innerHTML = "";
      if (!options.payment.paypal_available) throw new Error("PayPal is not available for this billing region yet.");
      await loadPayPalSdk(options.payment.paypal_client_id);
      window.paypal.Buttons({
        createOrder: function () {
          var path = isAddon ? "/api/billing/paypal/kundli-order" : "/api/billing/paypal/order";
          return api(path, isAddon ? {} : {plan: plan}).then(function (result) { return result.order_id; });
        },
        onApprove: async function (data) {
          billingMessage = "Verifying payment…"; document.getElementById("billingMessage").textContent = billingMessage;
          await api("/api/billing/paypal/capture", {order_id: data.orderID});
          billingMessage = isAddon ? "Payment confirmed. One extra saved-Kundli slot is active." : "Payment confirmed. Your pass is active.";
          await refresh(); await loadBilling();
          window.dispatchEvent(new Event(isAddon ? "nuvora:kundli-slots-changed" : "nuvora:access-changed"));
          document.getElementById("billingMessage").textContent = billingMessage;
        },
        onCancel: function () { billingMessage = "Checkout cancelled; you have not been charged."; document.getElementById("billingMessage").textContent = billingMessage; },
        onError: function () { billingMessage = "PayPal could not complete checkout. Please try again."; document.getElementById("billingMessage").textContent = billingMessage; }
      }).render("#paypalButtons");
      var addon = (options.addons || [])[0], selectedPlan = options.plans.find(function (x) { return x.key === plan; });
      document.getElementById("paypalHint").textContent = isAddon ? "One-time " + (addon ? addon.price : "local price") + " for one additional saved Kundli slot."
        : "One-time " + (selectedPlan ? selectedPlan.price : "pass price") + " for " + (selectedPlan ? selectedPlan.term.toLowerCase() : "your selected pass") + ".";
      billingMessage = "Choose PayPal below to approve the one-time purchase."; document.getElementById("billingMessage").textContent = billingMessage;
    } catch (error) { billingMessage = error.message || "PayPal checkout could not start."; document.getElementById("billingMessage").textContent = billingMessage; }
  }
  window.addEventListener("nuvora:youpi-message", function (event) {
    billingMessage = event.detail; document.getElementById("billingMessage").textContent = billingMessage;
  });
  window.addEventListener("nuvora:youpi-paid", async function (event) {
    await refresh(); await loadBilling();
    if (event.detail.kind === "pass") window.dispatchEvent(new Event("nuvora:access-changed"));
  });
  if (window.NuvoraYoupi) window.NuvoraYoupi.resume();
  function openBilling(message) { billingMessage = message || "Choose a pass to unlock detailed Kundli sections, core PDF downloads and unlimited chat."; navigate("billing"); }
  function openKundliPurchase() { openBilling("Your included saved-Kundli slot is in use. Add a slot for a one-time " + (accountState && accountState.user.country_code === "IN" ? "₹111" : "£1") + " payment."); }
  window.NuvoraAccount = {
    refresh: function () { return refresh().catch(function () {}); }, openBilling: openBilling, openKundliPurchase: openKundliPurchase,
    hasFullAccess: function () { return !!(accountState && accountState.subscription && accountState.subscription.active); },
    hasKundliSlotAvailable: function () { return !!(accountState && accountState.kundlis && (accountState.kundlis.unlimited || accountState.kundlis.remaining > 0)); }
  };

  async function initialize() {
    var region = null;
    try {
      region = await api("/api/auth/region");
      document.getElementById("authRegion").value = region.country_code;
      googleClientId = region.google_client_id || null;
    } catch (_) {}
    showAuthMode();
    renderGoogleButton().catch(function () {});
    try {
      await refresh(); document.body.classList.remove("auth-pending", "signed-out"); root.style.display = "none";
      fillKundliSelect(); renderProfile(); await showView("dashboard");
      if (store.current()) { await ensureChart(); await refresh(); }
    } catch (_) { setSignedOut(); }
  }
  initialize();
})();
