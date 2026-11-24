/* Nuvora admin dashboard. Reads /api/admin/overview and renders every view. */
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const nf = new Intl.NumberFormat("en-GB");
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const VIEWS = {
    overview: { n: "01", title: "Overview" },
    users: { n: "02", title: "Users" },
    orders: { n: "03", title: "Orders" },
  };
  const METRICS = { readings: "readings", signins: "sign-ins", signups: "sign-ups", orders: "orders" };
  const AVATAR_COLOURS = [
    ["#e8d6cd", "#241c18"], ["#c8d5f0", "#14151a"], ["#eec4e5", "#2a1626"], ["#d5e5c4", "#172012"],
    ["#f3dfa8", "#2a2006"], ["#cfe7ee", "#0f2329"], ["#e0d4f7", "#1f1636"],
  ];
  const state = {
    data: null, view: "overview", filter: "all", query: "", layout: "table",
    sort: { key: "last_seen", dir: "desc" }, selected: new Set(), metric: "readings",
  };

  // ---------- helpers ----------
  function hash(text) {
    let h = 2166136261;
    for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function nameOf(email) {
    const local = String(email).split("@")[0].replace(/\d+$/, "");
    const words = local.split(/[._\-+]+/).filter(Boolean);
    return words.length ? words.map(w => w[0].toUpperCase() + w.slice(1)).join(" ") : String(email);
  }
  function initials(email) {
    const words = nameOf(email).split(" ");
    return ((words[0] || "?")[0] + (words[1] ? words[1][0] : (words[0] || "").slice(1, 2))).toUpperCase();
  }
  function avatar(email, extraClass = "", style = "") {
    const [bg, ink] = AVATAR_COLOURS[hash(email) % AVATAR_COLOURS.length];
    return `<span class="av ${extraClass}" style="--av-bg:${bg};--av-ink:${ink};${style}">${esc(initials(email))}</span>`;
  }
  function fmtDate(iso) {
    if (!iso) return "–";
    const d = new Date(iso);
    return isNaN(d) ? "–" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function ago(iso) {
    if (!iso) return "Never";
    const t = Date.parse(iso);
    if (isNaN(t)) return "–";
    const s = (Date.now() - t) / 1000;
    if (s < 90) return "Just now";
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    const days = Math.floor(s / 86400);
    if (days === 1) return "Yesterday";
    if (days < 31) return `${days} days ago`;
    return fmtDate(iso);
  }
  function money(currency, amount) {
    const value = Number(amount) || 0;
    try {
      return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-GB", {
        style: "currency", currency, minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2,
      }).format(value);
    } catch { return `${currency} ${amount}`; }
  }
  const plural = (n, one, many = one + "s") => `${nf.format(n)} ${n === 1 ? one : many}`;
  const region = code => (code === "IN" ? "India" : "UK & intl");

  function countUp(el, target) {
    const value = Number(target) || 0;
    if (reduceMotion() || value === 0) { el.textContent = nf.format(value); return; }
    const start = performance.now();
    const duration = 900 + Math.min(600, value * 2);
    const tick = now => {
      const p = Math.min(1, (now - start) / duration);
      el.textContent = nf.format(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  let toastTimer;
  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  // ---------- loading ----------
  async function load() {
    document.body.classList.add("loading");
    $("#refreshTop").classList.add("spinning");
    try {
      const res = await fetch("/api/admin/overview", { credentials: "same-origin", cache: "no-store" });
      if (res.status === 401 || res.status === 403) { gate(res.status); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.data = await res.json();
      document.body.classList.remove("gated");
      $("#gate").hidden = true;
      render();
    } catch (err) {
      toast("Couldn't load the dashboard. Check the server and try again.");
    } finally {
      document.body.classList.remove("loading");
      $("#refreshTop").classList.remove("spinning");
    }
  }

  function gate(status) {
    document.body.classList.add("gated");
    $("#gate").hidden = false;
    $("#title").textContent = "Admin";
    $("#eyebrow").textContent = "[00] · Restricted";
    if (status === 403) {
      $("#gateTitle").textContent = "This account isn't an administrator";
      $("#gateText").textContent = "You're signed in, but only the Nuvora administrator account can open this dashboard.";
    }
    $("#convText").textContent = "Sign in to see numbers";
  }

  // ---------- render ----------
  function render() {
    renderSide();
    renderOverview();
    renderUsers();
    renderOrders();
    renderBell();
    setView(state.view, false);
  }

  function renderSide() {
    const d = state.data;
    $("#navUsers").textContent = nf.format(d.totals.users);
    $("#navOrders").textContent = d.orders.total ? nf.format(d.orders.total) : "";
    const customers = Math.max(0, d.totals.users - d.totals.admins);
    const pct = customers ? Math.round((d.totals.paid_active / customers) * 100) : 0;
    $("#convPct").textContent = `${pct}%`;
    requestAnimationFrame(() => { $("#convBar").style.width = `${Math.max(pct, customers ? 2 : 0)}%`; });
    $("#convText").textContent = `${nf.format(d.totals.paid_active)} of ${plural(customers, "customer")} on a pass`;
    $("#me").textContent = initials(d.admin.email);
    $("#me").title = d.admin.email;
  }

  function subline(view) {
    const d = state.data;
    if (!d) return "";
    const synced = `synced ${ago(d.generated_at).toLowerCase()}`;
    if (view === "users") {
      const google = d.providers.google || 0;
      return `${plural(d.totals.users, "account")} · ${nf.format(d.totals.paid_active)} on a paid pass · ${nf.format(google)} via Google · ${synced}`;
    }
    if (view === "orders") {
      return `${plural(d.orders.total, "order")} · ${nf.format(d.orders.paid)} paid · ${nf.format(d.orders.pending)} awaiting payment · ${synced}`;
    }
    return `${plural(d.totals.users, "account")} · ${nf.format(d.regions.IN || 0)} in India · ${nf.format(d.regions.GB || 0)} UK & international · ${synced}`;
  }

  function renderOverview() {
    const d = state.data;
    const now = new Date(d.generated_at);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    $("#ovPeriod").textContent = `${now.toLocaleDateString("en-GB", { month: "short", year: "numeric" })} · vs ${prev.toLocaleDateString("en-GB", { month: "long" })}`;

    // Hero
    countUp($("#heroCount"), d.totals.active_30d);
    $("#heroToday").textContent = nf.format(d.totals.active_today);
    const share = d.totals.users ? Math.round((d.totals.active_30d / d.totals.users) * 100) : 0;
    $("#heroFoot").textContent = `${share}% of ${plural(d.totals.users, "account")} signed in · ${nf.format(d.totals.new_this_month)} joined this month`;
    renderAvatarCloud();

    // Plans
    renderBubbles();
    const total = d.plans.reduce((sum, p) => sum + p.count, 0) || 1;
    $("#plansFoot").textContent = [...d.plans].sort((a, b) => b.count - a.count).slice(0, 3)
      .map(p => `${p.label} ${Math.round((p.count / total) * 100)}%`).join(" · ");

    // New this month
    countUp($("#newCount"), d.totals.new_this_month);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const fresh = d.users.filter(u => Date.parse(u.created_at) >= monthStart).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    $("#newStack").innerHTML = fresh.slice(0, 4).map(u => avatar(u.email)).join("") +
      (fresh.length > 4 ? `<span class="av more">+${fresh.length - 4}</span>` : "");
    const diff = d.totals.new_this_month - d.totals.new_last_month;
    $("#newFoot").textContent = `${diff >= 0 ? "+" : "−"}${nf.format(Math.abs(diff))} vs ${nf.format(d.totals.new_last_month)} last month`;

    // Revenue
    const [first, ...rest] = d.revenue;
    $("#revenue").textContent = first ? money(first.currency, first.amount) : money((d.regions.IN || 0) >= (d.regions.GB || 0) ? "INR" : "GBP", 0);
    $("#revFoot").textContent = first
      ? [plural(first.orders, "paid order"), ...rest.map(r => `${money(r.currency, r.amount)} (${r.orders})`)].join(" · ")
      : "No paid orders yet";
    const badge = $("#pendingBadge");
    badge.hidden = !d.orders.pending;
    badge.textContent = `${nf.format(d.orders.pending)} awaiting`;

    // Readings & kundlis
    countUp($("#readCount"), d.readings.total);
    const last30 = d.activity.slice(-30).reduce((sum, day) => sum + day.readings, 0);
    $("#readFoot").textContent = `${plural(d.readings.readers, "reader")} · ${nf.format(last30)} in the last 30 days`;
    countUp($("#kundliCount"), d.kundlis);
    $("#kundliFoot").textContent = `${plural(d.reports_owned, "premium report")} owned`;

    renderDots();

    const recent = d.users.filter(u => u.last_seen).slice(0, 6);
    $("#recentMeta").textContent = recent.length ? `${recent.length} most recent` : "No sign-ins yet";
    $("#recentTable").innerHTML = `<thead><tr><th>User</th><th>Plan</th><th>Status</th><th>Usage</th><th>Region</th><th>Last sign-in</th></tr></thead>
      <tbody>${recent.map((u, i) => `<tr style="animation-delay:${i * 35}ms">
        <td>${who(u)}</td><td>${planTag(u)}</td><td>${statusOf(u)}</td><td>${usage(u)}</td>
        <td class="muted">${region(u.country)}</td><td class="muted">${ago(u.last_seen)}</td></tr>`).join("")}</tbody>`;
  }

  const CLOUD_SLOTS = [[50, 40, 66], [22, 20, 46], [80, 16, 42], [13, 64, 38], [38, 80, 48], [74, 62, 50], [93, 42, 32], [63, 92, 34]];
  function renderAvatarCloud() {
    const d = state.data;
    const active = d.users.filter(u => u.last_seen);
    const pool = (active.length ? active : d.users);
    const shown = pool.slice(0, CLOUD_SLOTS.length - (pool.length > CLOUD_SLOTS.length ? 1 : 0));
    let html = shown.map((u, i) => {
      const [x, y, size] = CLOUD_SLOTS[i];
      return avatar(u.email, "", `left:${x}%;top:${y}%;width:${size}px;height:${size}px;margin:-${size / 2}px 0 0 -${size / 2}px;font-size:${Math.round(size * 0.3)}px;animation-delay:${i * -0.7}s,${i * 60}ms`);
    }).join("");
    if (pool.length > shown.length) {
      const [x, y, size] = CLOUD_SLOTS[CLOUD_SLOTS.length - 1];
      html += `<span class="av more" style="left:${x}%;top:${y}%;width:${size + 6}px;height:${size + 6}px;margin:-${(size + 6) / 2}px 0 0 -${(size + 6) / 2}px;font-size:11px">+${pool.length - shown.length}</span>`;
    }
    $("#avatarCloud").innerHTML = html;
  }

  function renderBubbles() {
    const box = $("#bubbles");
    const plans = [...state.data.plans].filter(p => p.count > 0).sort((a, b) => b.count - a.count).slice(0, 5);
    const w = box.clientWidth || 300;
    const h = box.clientHeight || 220;
    if (!plans.length) { box.innerHTML = ""; return; }
    const max = plans[0].count;
    let radii = plans.map(p => Math.max(22, Math.min(w, h) * 0.36 * Math.sqrt(p.count / max)));
    const area = radii.reduce((s, r) => s + Math.PI * r * r, 0);
    const limit = w * h * 0.42;
    if (area > limit) radii = radii.map(r => Math.max(20, r * Math.sqrt(limit / area)));

    const cx = w * 0.4, cy = h * 0.52;
    const placed = [];
    plans.forEach((plan, i) => {
      const r = radii[i];
      if (!i) { placed.push({ plan, r, x: Math.max(r + 2, Math.min(cx, w - r - 2)), y: Math.max(r + 2, Math.min(cy, h - r - 2)) }); return; }
      let best = null;
      for (let a = 0; a < 360; a += 8) {
        for (const p of placed) {
          const angle = ((a + i * 53) * Math.PI) / 180;
          const dist = p.r + r + 7;
          const x = p.x + Math.cos(angle) * dist, y = p.y + Math.sin(angle) * dist;
          if (x - r < 2 || x + r > w - 2 || y - r < 2 || y + r > h - 2) continue;
          if (placed.some(q => Math.hypot(q.x - x, q.y - y) < q.r + r + 6)) continue;
          const score = Math.hypot(x - cx, y - cy);
          if (!best || score < best.score) best = { x, y, score };
        }
      }
      if (best) placed.push({ plan, r, x: best.x, y: best.y });
    });
    box.innerHTML = placed.map(({ plan, r, x, y }, i) => {
      const n = i + 1;
      return `<div class="bubble${r < 32 ? " tiny" : ""}" style="left:${x}px;top:${y}px;width:${r * 2}px;height:${r * 2}px;background:var(--b${n});color:var(--b${n}-ink);animation-delay:${i * 90}ms" title="${esc(plan.label)}: ${plan.count}">
        <b>${nf.format(plan.count)}</b><small>${esc(plan.label.replace(" pass", ""))}</small></div>`;
    }).join("");
    box.setAttribute("aria-label", "Accounts by plan: " + plans.map(p => `${p.label} ${p.count}`).join(", "));
  }

  function renderDots() {
    const days = state.data.activity;
    const key = state.metric;
    const values = days.map(day => day[key] || 0);
    const max = Math.max(...values, 0);
    const total = values.reduce((a, b) => a + b, 0);
    const level = v => (!v || !max ? 0 : v / max <= 0.25 ? 1 : v / max <= 0.5 ? 2 : v / max <= 0.75 ? 3 : 4);
    $("#dots").innerHTML = days.map((day, i) => {
      const v = values[i];
      return `<i class="l${level(v)}" style="--c:${Math.floor(i / 7)};--r:${i % 7}" data-i="${i}"></i>`;
    }).join("");
    $("#actSub").textContent = `${nf.format(total)} ${METRICS[key]} in the last 26 weeks`;
    $("#dots").setAttribute("aria-label", `${total} ${METRICS[key]} in the last 26 weeks; busiest day had ${max}.`);
    $("#actHover").textContent = max ? `Busiest day: ${nf.format(max)} ${METRICS[key]} on ${fmtDate(days[values.indexOf(max)].date)}` : `No ${METRICS[key]} in this period yet.`;
  }

  // ---------- users ----------
  function who(u) {
    return `<div class="who">${avatar(u.email)}<span><b>${esc(nameOf(u.email))}</b><small>${esc(u.email)}</small></span></div>`;
  }
  function planTag(u) {
    const cls = u.status === "admin" ? "admin" : u.status === "active" ? "paid" : "";
    return `<span class="tag ${cls}">${esc(u.plan_label)}</span>`;
  }
  function statusOf(u) {
    if (u.status === "admin") return `<span class="status admin">Administrator</span>`;
    if (u.status === "active") {
      const left = Math.max(0, Math.ceil((Date.parse(u.plan_expires_at) - Date.now()) / 86400000));
      return `<span class="status active">Active · ${left}d left</span>`;
    }
    if (u.status === "expired") return `<span class="status expired">Pass expired</span>`;
    return `<span class="status free">Free · ${Math.min(u.questions_used, 2)}/2 asked</span>`;
  }
  function usage(u) {
    const max = Math.max(1, ...state.data.users.map(x => x.readings));
    const pct = Math.round((u.readings / max) * 100);
    return `<div class="usage${u.readings ? "" : " zero"}"><span class="bar"><i style="width:${u.readings ? Math.max(pct, 4) : 0}%"></i></span>${plural(u.readings, "reading")}</div>`;
  }

  function filteredUsers() {
    const q = state.query.trim().toLowerCase();
    const list = state.data.users.filter(u => {
      if (state.filter === "paid" && u.status !== "active") return false;
      if (state.filter === "free" && !(u.status === "free" || u.status === "expired")) return false;
      if ((state.filter === "IN" || state.filter === "GB") && u.country !== state.filter) return false;
      if (!q) return true;
      return [u.email, nameOf(u.email), u.plan_label, region(u.country), u.country, u.provider].join(" ").toLowerCase().includes(q);
    });
    const { key, dir } = state.sort;
    const sign = dir === "asc" ? 1 : -1;
    const value = u => key === "email" ? u.email : key === "readings" || key === "kundlis" ? u[key] : (u[key] || "");
    return list.sort((a, b) => {
      const va = value(a), vb = value(b);
      return (va > vb ? 1 : va < vb ? -1 : 0) * sign;
    });
  }

  function sortButton(key, label) {
    const on = state.sort.key === key;
    return `<button type="button" data-sort="${key}" class="${on ? "sorted" : ""}${on && state.sort.dir === "asc" ? " asc" : ""}">${label}</button>`;
  }

  function renderUsers() {
    const list = filteredUsers();
    const ids = new Set(list.map(u => u.id));
    const selectedHere = list.filter(u => state.selected.has(u.id)).length;
    $("#usersMeta").textContent = `${plural(list.length, "account")} · sorted by ${state.sort.key === "last_seen" ? "last sign-in" : state.sort.key === "created_at" ? "join date" : state.sort.key}`;
    $("#exportLabel").textContent = state.selected.size ? `Export ${nf.format(state.selected.size)} selected` : "Export CSV";
    $("#usersEmpty").hidden = list.length > 0;

    $("#usersTable").innerHTML = `<thead><tr>
        <th class="chk"><input class="check" type="checkbox" id="checkAll" aria-label="Select all shown users"></th>
        <th>${sortButton("email", "User")}</th><th>Plan</th><th>Region</th><th>Status</th>
        <th>${sortButton("readings", "Usage")}</th><th>${sortButton("kundlis", "Kundlis")}</th>
        <th>${sortButton("created_at", "Joined")}</th><th>${sortButton("last_seen", "Last sign-in")}</th></tr></thead>
      <tbody>${list.map((u, i) => `<tr class="${state.selected.has(u.id) ? "sel" : ""}" data-id="${u.id}" style="animation-delay:${Math.min(i, 20) * 22}ms">
        <td class="chk"><input class="check" type="checkbox" data-id="${u.id}" aria-label="Select ${esc(u.email)}" ${state.selected.has(u.id) ? "checked" : ""}></td>
        <td>${who(u)}</td><td>${planTag(u)}</td>
        <td><span class="tag mono">${esc(u.country)}</span> <span class="muted">${u.provider === "google" ? "Google" : "Email"}</span></td>
        <td>${statusOf(u)}</td><td>${usage(u)}</td>
        <td class="muted">${u.kundlis} / ${u.status === "admin" ? "∞" : u.kundli_slots}</td>
        <td class="muted">${fmtDate(u.created_at)}</td><td class="muted">${ago(u.last_seen)}</td></tr>`).join("")}</tbody>`;
    const all = $("#checkAll");
    all.checked = list.length > 0 && selectedHere === list.length;
    all.indeterminate = selectedHere > 0 && selectedHere < list.length;
    all.dataset.ids = [...ids].join(",");

    $("#usersCards").innerHTML = list.map((u, i) => `<article class="person" style="animation-delay:${Math.min(i, 20) * 25}ms">
        ${who(u)}
        <div class="row">${planTag(u)} ${statusOf(u)}</div>
        <dl><div><dt>Readings</dt><dd>${nf.format(u.readings)}</dd></div><div><dt>Kundlis</dt><dd>${u.kundlis}</dd></div><div><dt>Seen</dt><dd>${ago(u.last_seen)}</dd></div></dl>
      </article>`).join("");
    $("#usersTableWrap").hidden = state.layout !== "table" || !list.length;
    $("#usersCards").hidden = state.layout !== "cards" || !list.length;
  }

  // ---------- orders ----------
  function renderOrders() {
    const d = state.data;
    countUp($("#oPaid"), d.orders.paid);
    countUp($("#oPending"), d.orders.pending);
    countUp($("#oFailed"), d.orders.failed);
    const revenueEl = $("#oRevenue");
    revenueEl.classList.toggle("multi", d.revenue.length > 1);
    revenueEl.innerHTML = d.revenue.length ? d.revenue.map(r => `<span>${esc(money(r.currency, r.amount))}</span>`).join("") : "–";
    $("#ordersMeta").textContent = d.orders.total ? `${plural(d.orders.total, "order")} · newest first` : "";
    const rows = d.recent_orders;
    $("#ordersEmpty").hidden = rows.length > 0;
    $("#ordersTable").parentElement.hidden = !rows.length;
    $("#exportOrders").hidden = !rows.length;
    $("#ordersTable").innerHTML = rows.length ? `<thead><tr><th>Order</th><th>Customer</th><th>Item</th><th>Provider</th><th>Amount</th><th>Status</th><th>Created</th><th>Paid</th></tr></thead>
      <tbody>${rows.map((o, i) => `<tr style="animation-delay:${Math.min(i, 20) * 22}ms">
        <td><span class="tag mono">${esc(String(o.id).slice(0, 8))}</span></td>
        <td>${who({ email: o.email })}</td><td>${esc(o.item)}</td>
        <td class="muted">${o.provider === "youpi" ? "UPI" : esc(o.provider[0].toUpperCase() + o.provider.slice(1))}</td>
        <td>${money(o.currency, o.amount)}</td>
        <td><span class="status ${esc(o.status)}">${o.status === "created" ? "Awaiting payment" : esc(o.status[0].toUpperCase() + o.status.slice(1))}</span></td>
        <td class="muted">${ago(o.created_at)}</td><td class="muted">${o.paid_at ? fmtDate(o.paid_at) : "–"}</td></tr>`).join("")}</tbody>` : "";
  }

  // ---------- notifications ----------
  function renderBell() {
    const d = state.data;
    const dayAgo = Date.now() - 86400000;
    const joinedToday = d.users.filter(u => Date.parse(u.created_at) >= dayAgo).length;
    const items = [];
    if (d.orders.pending) items.push(["warn", `${plural(d.orders.pending, "order")} awaiting payment`, "Checkout started but not completed yet."]);
    if (d.orders.failed) items.push(["bad", `${plural(d.orders.failed, "failed payment")}`, "Worth a look in Orders."]);
    if (joinedToday) items.push(["good", `${plural(joinedToday, "new account")} today`, "Joined in the last 24 hours."]);
    if (d.totals.active_today) items.push(["", `${plural(d.totals.active_today, "reader")} signed in today`, "Based on new sign-in sessions."]);
    const count = (d.orders.pending || 0) + (d.orders.failed || 0) + joinedToday;
    const badge = $("#bellCount");
    badge.hidden = !count;
    badge.textContent = count > 99 ? "99+" : String(count);
    $("#bell").classList.toggle("ring", count > 0);
    $("#bellPanel").innerHTML = `<h3>Notifications</h3>` + (items.length
      ? items.map(([tone, title, text]) => `<div class="bell-item"><i class="${tone}"></i><div><b>${esc(title)}</b>${esc(text)}</div></div>`).join("")
      : `<div class="bell-item"><i class="good"></i><div><b>All quiet</b>Nothing needs your attention.</div></div>`);
  }

  // ---------- CSV ----------
  function csvCell(value) {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }
  function download(filename, rows) {
    const blob = new Blob(["﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const today = () => new Date().toISOString().slice(0, 10);

  function exportUsers() {
    const list = state.selected.size ? state.data.users.filter(u => state.selected.has(u.id)) : filteredUsers();
    download(`nuvora-users-${today()}.csv`, [
      ["email", "plan", "status", "region", "sign_in", "readings", "questions_used", "tarot_used", "kundlis", "kundli_slots", "reports", "joined", "last_sign_in", "pass_expires"],
      ...list.map(u => [u.email, u.plan_label, u.status, u.country, u.provider, u.readings, u.questions_used, u.tarot_used,
        u.kundlis, u.kundli_slots, u.reports, u.created_at, u.last_seen || "", u.plan_expires_at || ""]),
    ]);
    toast(`Exported ${plural(list.length, "user")}`);
  }
  function exportOrders() {
    const rows = state.data.recent_orders;
    download(`nuvora-orders-${today()}.csv`, [
      ["order", "email", "item", "provider", "currency", "amount", "status", "created", "paid"],
      ...rows.map(o => [o.id, o.email, o.item, o.provider, o.currency, o.amount, o.status, o.created_at, o.paid_at || ""]),
    ]);
    toast(`Exported ${plural(rows.length, "order")}`);
  }

  // ---------- navigation ----------
  function setView(view, scroll = true) {
    let target = view;
    if (view === "activity") target = "overview";
    if (!VIEWS[target]) target = "overview";
    state.view = target;
    $$(".view").forEach(el => el.classList.toggle("on", el.id === `view-${target}`));
    $$(".nav-item[data-view]").forEach(el => el.classList.toggle("on", el.dataset.view === view || (view !== "activity" && el.dataset.view === target)));
    if (!document.body.classList.contains("gated")) {
      $("#title").textContent = VIEWS[target].title;
      $("#eyebrow").textContent = `[${VIEWS[target].n}] · ${view === "activity" ? "Activity" : VIEWS[target].title}`;
      $("#subline").textContent = subline(target);
    }
    $("#crumbHere").textContent = view === "activity" ? "Activity" : VIEWS[target].title;
    document.title = `${VIEWS[target].title} · Nuvora Admin`;
    if (target === "overview" && state.data) requestAnimationFrame(renderBubbles);
    if (scroll) {
      if (view === "activity") $("#activityCard").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
      else window.scrollTo({ top: 0, behavior: "auto" });
    }
  }

  function bind() {
    window.addEventListener("hashchange", () => setView(location.hash.slice(1) || "overview"));
    $$("[data-goto]").forEach(a => a.addEventListener("click", () => { /* hashchange handles it */ }));

    $("#refreshTop").addEventListener("click", () => load());

    const shell = $("#shell");
    try { if (localStorage.getItem("nuvora-admin-side") === "collapsed") shell.classList.add("collapsed"); } catch { /* ignore */ }
    $("#collapse").addEventListener("click", () => {
      shell.classList.toggle("collapsed");
      const collapsed = shell.classList.contains("collapsed");
      $("#collapse").setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
      try { localStorage.setItem("nuvora-admin-side", collapsed ? "collapsed" : "open"); } catch { /* ignore */ }
      setTimeout(() => state.data && renderBubbles(), 380);
    });

    const bell = $("#bell"), panel = $("#bellPanel");
    bell.addEventListener("click", e => {
      e.stopPropagation();
      panel.hidden = !panel.hidden;
      bell.setAttribute("aria-expanded", String(!panel.hidden));
    });
    document.addEventListener("click", e => {
      if (!panel.hidden && !panel.contains(e.target)) { panel.hidden = true; bell.setAttribute("aria-expanded", "false"); }
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && !panel.hidden) { panel.hidden = true; bell.setAttribute("aria-expanded", "false"); bell.focus(); }
      if (e.key === "/" && state.view === "users" && document.activeElement !== $("#q")) { e.preventDefault(); $("#q").focus(); }
    });

    $("#actSeg").addEventListener("click", e => {
      const btn = e.target.closest("button[data-metric]");
      if (!btn || !state.data) return;
      state.metric = btn.dataset.metric;
      $$("#actSeg button").forEach(b => b.setAttribute("aria-selected", String(b === btn)));
      renderDots();
    });
    $("#dots").addEventListener("mouseover", e => {
      const dot = e.target.closest("i[data-i]");
      if (!dot || !state.data) return;
      const day = state.data.activity[Number(dot.dataset.i)];
      $("#actHover").textContent = `${fmtDate(day.date)} · ${plural(day[state.metric] || 0, METRICS[state.metric].replace(/s$/, ""), METRICS[state.metric])}`;
    });

    $("#userSeg").addEventListener("click", e => {
      const btn = e.target.closest("button[data-filter]");
      if (!btn || !state.data) return;
      state.filter = btn.dataset.filter;
      $$("#userSeg button").forEach(b => b.setAttribute("aria-selected", String(b === btn)));
      renderUsers();
    });
    let searchTimer;
    $("#q").addEventListener("input", e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.query = e.target.value; if (state.data) renderUsers(); }, 120);
    });
    $$("[data-layout]").forEach(btn => btn.addEventListener("click", () => {
      state.layout = btn.dataset.layout;
      $$("[data-layout]").forEach(b => b.setAttribute("aria-selected", String(b === btn)));
      if (state.data) renderUsers();
    }));

    $("#usersTable").addEventListener("click", e => {
      const sort = e.target.closest("button[data-sort]");
      if (sort) {
        const key = sort.dataset.sort;
        state.sort = { key, dir: state.sort.key === key && state.sort.dir === "desc" ? "asc" : "desc" };
        renderUsers();
      }
    });
    $("#usersTable").addEventListener("change", e => {
      const box = e.target;
      if (!box.classList.contains("check")) return;
      if (box.id === "checkAll") {
        box.dataset.ids.split(",").filter(Boolean).map(Number).forEach(id => box.checked ? state.selected.add(id) : state.selected.delete(id));
      } else {
        const id = Number(box.dataset.id);
        box.checked ? state.selected.add(id) : state.selected.delete(id);
      }
      renderUsers();
    });

    $("#exportUsers").addEventListener("click", () => state.data && exportUsers());
    $("#exportOrders").addEventListener("click", () => state.data && exportOrders());

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => state.data && state.view === "overview" && renderBubbles(), 150);
    });
  }

  bind();
  state.view = location.hash.slice(1) || "overview";
  setView(state.view, false);
  load();
})();
