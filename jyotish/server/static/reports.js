"use strict";
(function () {
  var main = document.querySelector("main"), options = null, loading = null;
  var view = document.createElement("section");
  view.className = "view"; view.id = "view-reports";
  view.innerHTML = '<div class="reports-hero"><div class="eyebrow">INSTANT PDF REPORTS · NO CALLS</div><h1>A deeper reading,<br>yours to keep.</h1><p>Choose a focused standalone report, or unlock the detailed Kundli and core PDF with a pass. Reports are generated from your calculated chart and become available in Reports after payment is verified.</p><div class="report-offer-line" id="reportOfferLine"></div></div><div class="purchase-terms" id="reportPurchaseTerms"></div><div class="report-grid" id="reportGrid"></div><div class="match-report-panel card" id="matchReportPanel" hidden><div class="eyebrow">PREMIUM MATCH MAKING</div><h2>Choose the second saved chart</h2><p class="muted">Your current Kundli is Partner 1. Partner 2 is calculated securely when the PDF is requested.</p><div class="row"><label>Partner 2<select id="matchPartner"></select></label><button class="btn ghost" id="addPartnerChart" type="button">Add a saved chart</button></div></div><div class="report-checkout" id="reportCheckout" hidden><div class="card paypal-frame"><div class="eyebrow">SECURE ONE-TIME CHECKOUT</div><p class="muted" id="reportPaypalHint"></p><div id="reportPaypalButtons"></div></div></div><div class="report-download-status" id="reportStatus" role="status"></div>';
  main.appendChild(view);

  var reportsNav = document.createElement("button"); reportsNav.dataset.v = "reports"; reportsNav.textContent = "Reports";
  var plansNav = document.querySelector('#topNav [data-v="billing"]');
  document.getElementById("topNav").insertBefore(reportsNav, plansNav || null);
  reportsNav.addEventListener("click", openReports);
  var reportsBottomNav = document.createElement("button"); reportsBottomNav.dataset.v = "reports"; reportsBottomNav.textContent = "Reports";
  var bottomPlans = document.querySelector('#bottomNav [data-v="billing"]');
  document.getElementById("bottomNav").insertBefore(reportsBottomNav, bottomPlans || null);
  reportsBottomNav.addEventListener("click", openReports);

  var offer = document.createElement("div"); offer.className = "offer-modal"; offer.id = "limitedOffer"; offer.hidden = true;
  offer.setAttribute("role", "dialog"); offer.setAttribute("aria-modal", "true"); offer.setAttribute("aria-labelledby", "offerTitle");
  offer.innerHTML = '<div class="offer-card"><button class="offer-close" id="offerClose" type="button" aria-label="Dismiss offer">×</button><div class="eyebrow">LIMITED TIME OFFER</div><h2 id="offerTitle">Half-price reports.<br>Don’t lose it.</h2><p>Launch pricing gives you every specialized PDF report at exactly half its verified INR reference price. Your first two chat questions are complimentary; detailed Kundli access and every PDF require payment.</p><div class="offer-deadline" id="offerDeadline"></div><div class="offer-actions"><button class="btn" id="offerView" type="button">View half-price reports</button><button class="btn ghost" id="offerDismiss" type="button">Not now</button></div></div>';
  document.body.appendChild(offer);

  function status(message) { document.getElementById("reportStatus").textContent = message || ""; }
  function dismissOffer() {
    if (options && options.report_offer) localStorage.setItem("nuvora.report-offer.dismissed", options.report_offer.ends_at);
    offer.hidden = true;
  }
  document.getElementById("offerClose").addEventListener("click", dismissOffer);
  document.getElementById("offerDismiss").addEventListener("click", dismissOffer);
  document.getElementById("offerView").addEventListener("click", function () { dismissOffer(); openReports(); });
  offer.addEventListener("click", function (event) { if (event.target === offer) dismissOffer(); });
  document.addEventListener("keydown", function (event) { if (event.key === "Escape" && !offer.hidden) dismissOffer(); });

  async function openReports() {
    await showView("reports");
    await loadReports();
  }
  async function loadReports() {
    try {
      options = await api("/api/billing/options"); renderReports(); maybeShowOffer();
    } catch (error) { status(error.message); }
  }
  function maybeShowOffer() {
    if (!options || !options.report_offer || !options.report_offer.active) return;
    var end = options.report_offer.ends_at;
    document.getElementById("offerDeadline").textContent = "Fixed offer deadline: " + new Date(end).toLocaleString() + ". Standard prices apply afterwards; this timer never resets.";
    if (localStorage.getItem("nuvora.report-offer.dismissed") !== end && !document.body.classList.contains("signed-out")) offer.hidden = false;
  }
  function renderReports() {
    var india = options.region.country_code === "IN";
    var upi = india && options.payment.upi_available;
    var terms = options.purchase_terms || {};
    var support = terms.support_email ? '<p>Refund or cancellation requests: <a href="mailto:' + esc(terms.support_email) + '?subject=Refund%20or%20cancellation%20request">' + esc(terms.support_email) + '</a>. Include your order ID if available.</p>' : '<p>Refund requests are not available yet because no support contact has been published.</p>';
    document.getElementById("reportPurchaseTerms").innerHTML = '<h2>Delivery, refunds &amp; support</h2><p>' + esc(terms.delivery || "Digital access is provided after payment verification.") + '</p><p><strong>Refund and cancellation terms:</strong> ' + esc(terms.published ? terms.refund_policy : "Not published yet. Checkout remains disabled until the policy and support contact are published.") + '</p>' + support;
    document.getElementById("reportOfferLine").textContent = india && options.report_offer.active
      ? "Limited time · exact half-price INR launch offer ends " + new Date(options.report_offer.ends_at).toLocaleDateString()
      : "Standalone reports · secure one-time purchase · PDF available after payment verification";
    document.getElementById("reportGrid").innerHTML = options.reports.map(function (product) {
      var enabled = (options.payment.paypal_available || upi) && !product.owned;
      var button = product.owned ? "Download instant PDF" : upi ? "Pay with UPI" : enabled ? "Unlock with PayPal" : "Purchases opening soon";
      var priceReference = india && product.offer ? '<div class="reference">Standard price ' + esc(product.reference_price) + ' · launch price ' + esc(product.half_price_inr) + ' INR</div>' : '';
      return '<article class="report-product ' + (product.owned ? "owned" : "") + '"><div class="eyebrow">' + (product.owned ? "UNLOCKED · DOWNLOAD ANYTIME" : product.offer && india ? "HALF-PRICE LAUNCH OFFER" : "STANDALONE PDF REPORT") + '</div><h2>' + esc(product.name) + '</h2><div class="report-price">' + esc(product.display) + '</div>' + priceReference + '<ul>' + product.features.map(function (feature) { return '<li>' + esc(feature) + '</li>'; }).join("") + '</ul><div class="report-product-actions"><button class="btn ' + (product.owned ? "" : "ghost") + '" type="button" data-report="' + esc(product.key) + '" ' + (!product.owned && !enabled ? "disabled" : "") + '>' + button + '</button><button class="sample-button" type="button" data-sample="' + esc(product.key) + '">Download one-page sample</button></div></article>';
    }).join("");
    document.querySelectorAll("[data-report]").forEach(function (button) {
      button.addEventListener("click", function () {
        var product = options.reports.find(function (item) { return item.key === button.dataset.report; });
        if (product.owned) {
          if (product.kind === "match") showMatchPanel(); else downloadReport(product.key);
        } else if (india) startReportYoupi(product); else startReportPayPal(product);
      });
    });
    document.querySelectorAll("[data-sample]").forEach(function (button) {
      button.addEventListener("click", function () { downloadSample(button.dataset.sample); });
    });
    document.getElementById("reportCheckout").hidden = true;
    document.getElementById("matchReportPanel").hidden = true;
  }

  async function downloadSample(product) {
    status("Preparing a one-page sample from your calculated chart…");
    try {
      if (!(await ensureChart())) throw new Error("Create or select a Kundli first.");
      var response = await fetch("/api/reports/sample", {method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({chart_id:CID, product:product})});
      if (!response.ok) {
        var body = await response.json().catch(function () { return {}; });
        throw new Error(body.detail || "The sample page could not be generated.");
      }
      var blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = "nuvora-" + product + "-sample.pdf"; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      status("One-page sample downloaded. It uses your current chart; matchmaking previews label their example chart.");
    } catch (error) { status(error.message); }
  }

  function showMatchPanel() {
    var panel = document.getElementById("matchReportPanel"), select = document.getElementById("matchPartner");
    var charts = store.all().filter(function (chart) { return chart.id !== store.current(); });
    select.innerHTML = charts.map(function (chart) { return '<option value="' + esc(chart.id) + '">' + esc(chart.body.name || chart.body.place || chart.id) + '</option>'; }).join("");
    panel.hidden = false; panel.scrollIntoView({behavior: "smooth", block: "center"});
    var button = document.createElement("button"); button.className = "btn"; button.id = "downloadMatchPdf"; button.textContent = "Download matchmaking PDF"; button.disabled = !charts.length;
    var old = panel.querySelector("#downloadMatchPdf"); if (old) old.remove();
    panel.querySelector(".row").appendChild(button);
    button.addEventListener("click", function () { downloadReport("match", select.value); });
    if (!charts.length) status("Add a second saved Kundli, then return here for the matchmaking PDF."); else status("");
  }
  document.getElementById("addPartnerChart").addEventListener("click", function () { openBirth(); });

  async function downloadReport(product, partnerId) {
    status("");
    if (product === "core") document.getElementById("pdfStatus").textContent = "Preparing your instant PDF…";
    else {
      var buttons = document.querySelectorAll("[data-report]"); buttons.forEach(function (button) { button.disabled = true; });
      status("Preparing your chart-linked PDF…");
    }
    try {
      if (!(await ensureChart())) throw new Error("Create or select a Kundli first.");
      var payload = {chart_id: CID, product: product};
      if (product === "match") {
        var partner = store.all().find(function (chart) { return chart.id === partnerId; });
        if (!partner) throw new Error("Choose the second saved chart.");
        payload.person2 = partner.body;
      }
      var response = await fetch("/api/reports/pdf", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload)});
      if (!response.ok) {
        var body = await response.json().catch(function () { return {}; });
        throw new Error(body.detail || "The PDF could not be generated.");
      }
      var blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement("a");
      var disposition = response.headers.get("Content-Disposition") || "", match = disposition.match(/filename="([^"]+)"/);
      link.href = url; link.download = match ? match[1] : "nuvora-kundli.pdf"; document.body.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
      status("Your PDF is ready and the download has started.");
      document.getElementById("pdfStatus").textContent = product === "core"
        ? "Downloaded instantly · Ganesha cover followed by your core Kundli sections."
        : "Downloaded instantly · Ganesha cover followed by your specialized report.";
    } catch (error) {
      status(error.message); document.getElementById("pdfStatus").textContent = error.message;
    } finally {
      if (options) renderReports();
    }
  }

  function loadPayPal(clientId) {
    if (window.paypal) return Promise.resolve();
    if (window.nuvoraPaypalLoading) return window.nuvoraPaypalLoading;
    window.nuvoraPaypalLoading = new Promise(function (resolve, reject) {
      var script = document.createElement("script"), url = new URL("https://www.paypal.com/sdk/js");
      url.searchParams.set("client-id", clientId); url.searchParams.set("currency", "GBP"); url.searchParams.set("intent", "capture"); url.searchParams.set("components", "buttons");
      script.src = url.toString(); script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
    });
    return window.nuvoraPaypalLoading;
  }
  async function startReportYoupi(product) {
    status("Creating your secure UPI checkout…");
    try { await window.NuvoraYoupi.start("report", product.key); }
    catch (error) { status(error.message || "UPI checkout could not start."); }
  }
  async function startReportPayPal(product) {
    var frame = document.getElementById("reportCheckout"), container = document.getElementById("reportPaypalButtons");
    frame.hidden = false; container.innerHTML = ""; status("Connecting secure checkout…");
    document.getElementById("reportPaypalHint").textContent = product.name + " · " + product.display + " · one-time standalone report purchase";
    frame.scrollIntoView({behavior: "smooth", block: "center"});
    try {
      await loadPayPal(options.payment.paypal_client_id);
      window.paypal.Buttons({
        createOrder: function () { return api("/api/billing/paypal/report-order", {product: product.key}).then(function (result) { return result.order_id; }); },
        onApprove: async function (data) {
          status("Verifying payment…");
          await api("/api/billing/paypal/capture", {order_id: data.orderID});
          status("Payment confirmed. " + product.name + " is unlocked; your instant PDF is ready.");
          await loadReports(); if (window.NuvoraAccount) await window.NuvoraAccount.refresh();
        },
        onCancel: function () { status("Checkout cancelled; you have not been charged."); },
        onError: function () { status("PayPal could not complete checkout. Please try again."); }
      }).render("#reportPaypalButtons");
      status("Choose PayPal below to approve the one-time purchase.");
    } catch (error) { status(error.message || "PayPal checkout could not start."); }
  }

  window.addEventListener("nuvora:youpi-message", function (event) { status(event.detail); });
  window.addEventListener("nuvora:youpi-paid", async function () {
    await loadReports(); if (window.NuvoraAccount) await window.NuvoraAccount.refresh();
  });
  if (window.NuvoraYoupi) window.NuvoraYoupi.resume();
  document.getElementById("paidReportsBtn").addEventListener("click", openReports);
  window.NuvoraReports = {open: openReports, download: downloadReport, refresh: loadReports};
  api("/api/auth/me").then(function () { return loadReports(); }).catch(function () {});
})();
