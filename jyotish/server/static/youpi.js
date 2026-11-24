"use strict";
(function () {
  var storageKey = "nuvora.youpi.pending", timer = null, checking = false;

  function pending() {
    try { return JSON.parse(sessionStorage.getItem(storageKey) || "null"); }
    catch (_) { sessionStorage.removeItem(storageKey); return null; }
  }
  function message(text) { window.dispatchEvent(new CustomEvent("nuvora:youpi-message", {detail: text})); }

  async function start(kind, key) {
    var path = kind === "report" ? "/api/billing/youpi/report-order" : kind === "kundli_slot" ? "/api/billing/youpi/kundli-order" : "/api/billing/youpi/order";
    var payload = kind === "report" ? {product: key} : kind === "kundli_slot" ? {} : {plan: key};
    var result = await api(path, payload);
    if (!result.checkout_url || !result.order_id) throw new Error("UPI checkout did not return a secure payment link.");
    sessionStorage.setItem(storageKey, JSON.stringify({order_id: result.order_id, kind: kind, key: key || null}));
    window.location.assign(result.checkout_url);
    return result;
  }

  async function check() {
    var order = pending();
    if (!order || checking) return;
    checking = true;
    try {
      var result = await api("/api/billing/youpi/status/" + encodeURIComponent(order.order_id));
      if (result.paid) {
        sessionStorage.removeItem(storageKey);
        if (timer) clearInterval(timer); timer = null;
        message("Payment reconciled. Your purchase is now unlocked.");
        window.dispatchEvent(new CustomEvent("nuvora:youpi-paid", {detail: order}));
        if (order.kind === "kundli_slot") window.dispatchEvent(new Event("nuvora:kundli-slots-changed"));
      } else if (["failed", "expired", "cancelled"].includes(result.status)) {
        sessionStorage.removeItem(storageKey);
        if (timer) clearInterval(timer); timer = null;
        message("UPI checkout ended without verified payment. You can try again.");
      } else if (result.gateway_status === "OBSERVED_SUCCESS") {
        message("Payment observed. Your purchase remains pending until bank-statement reconciliation is complete.");
      } else {
        message("UPI payment is pending. Access activates only after verified bank-statement reconciliation.");
      }
    } catch (error) {
      message(error.message || "Could not check UPI payment status yet.");
    } finally { checking = false; }
  }

  function resume() {
    if (!pending() || timer) return;
    check();
    timer = setInterval(check, 4000);
  }

  window.NuvoraYoupi = {start: start, resume: resume, check: check};
  resume();
})();
