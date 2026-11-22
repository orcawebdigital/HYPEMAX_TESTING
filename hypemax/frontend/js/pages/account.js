/* Login / register / password reset (/login) and the customer dashboard (/account/*). */
window.HM_PAGE = async function () {
  const { $, $$, esc, api, inr, img, toast, busy, me, config, nextUrl, fmtDate, card, markActive, site, loginUrl } = HM;
  const page = document.body.dataset.page;
  const path = location.pathname.replace(/\/+$/, "");
  const sp = new URLSearchParams(location.search);

  // ======================= AUTH PAGES =======================
  if (page === "login") {
    if (await me()) { location.replace(nextUrl()); return; }
    const cfg = await config();
    let mode = path === "/register" ? "register" : path === "/forgot-password" ? "forgot" : "login";
    const draw = () => {
      $("#app").innerHTML = `<div class="wrap pg"><div class="auth card">
        ${mode === "forgot" ? `<h2 style="font-size:1.5rem">Reset your password</h2><p class="muted small" style="margin:6px 0 14px">Enter your account email and we'll send you a reset link.</p>
          <form id="ff"><label>Email</label><input name="email" type="email" required autocomplete="email"><button class="btn p block">Send reset link</button></form>
          <p class="small" style="margin-top:14px"><a class="link" href="/login" data-mode="login">← Back to login</a></p>`
        : `<div class="tabs" role="tablist"><button data-mode="login" class="${mode === "login" ? "on" : ""}" role="tab">Log in</button><button data-mode="register" class="${mode === "register" ? "on" : ""}" role="tab">Create account</button></div>
          ${mode === "login" ? `<form id="lf"><label>Email</label><input name="email" type="email" required autocomplete="email"><label>Password</label><input name="password" type="password" required autocomplete="current-password">
            <p class="small" style="margin:-4px 0 12px;text-align:right"><a class="link" href="/forgot-password" data-mode="forgot">Forgot password?</a></p><button class="btn p block">Log in</button></form>`
          : `<form id="rf"><label>Full name</label><input name="name" required minlength="2" maxlength="120" autocomplete="name"><label>Email</label><input name="email" type="email" required autocomplete="email">
            <label>Mobile number <span style="text-transform:none">(optional)</span></label><input name="phone" type="tel" inputmode="numeric" autocomplete="tel" pattern="(\\+?91)?[6-9][0-9]{9}">
            <label>Password</label><input name="password" type="password" required minlength="8" autocomplete="new-password" placeholder="8+ characters with letters and numbers">
            <p class="tiny muted" style="margin:-4px 0 12px">By creating an account you agree to our <a class="link" href="/policies/terms">Terms</a> and <a class="link" href="/policies/privacy">Privacy Policy</a>.</p><button class="btn p block">Create account</button></form>`}
          ${cfg.google_client_id ? `<div class="or">or</div>${cfg.features.google_redirect
            ? `<a class="btn w block lg gsi" href="/api/auth/google/start?next=${encodeURIComponent(nextUrl())}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>Continue with Google</a>`
            : '<div id="gbtn"></div>'}` : ""}`}
        <div id="msg" style="margin-top:12px">${sp.get("google_error") ? `<div class="notice bad">${esc(sp.get("google_error"))}</div>` : ""}</div></div></div>`;
      $$("[data-mode]").forEach((b) => (b.onclick = (e) => { e.preventDefault(); mode = b.dataset.mode; history.replaceState(null, "", (mode === "login" ? "/login" : mode === "register" ? "/register" : "/forgot-password") + location.search); draw(); }));
      const done = () => { toast("Welcome!", "ok"); location.replace(nextUrl()); };
      const err = (e) => ($("#msg").innerHTML = `<div class="notice bad">${esc(e.message)}</div>`);
      if ($("#lf")) $("#lf").onsubmit = async (e) => { e.preventDefault(); try { await busy(e.target.querySelector("button"), () => api("/api/auth/login", { method: "POST", body: Object.fromEntries(new FormData(e.target)) })); done(); } catch (x) { err(x); } };
      if ($("#rf")) $("#rf").onsubmit = async (e) => {
        e.preventDefault();
        try {
          const r = await busy(e.target.querySelector("button"), () => api("/api/auth/register", { method: "POST", body: Object.fromEntries(new FormData(e.target)) }));
          if (r.verification_required) $("#msg").innerHTML = `<div class="notice good">${esc(r.message)}</div>`; else done();
        } catch (x) { err(x); }
      };
      if ($("#ff")) $("#ff").onsubmit = async (e) => {
        e.preventDefault();
        try {
          const r = await busy(e.target.querySelector("button"), () => api("/api/auth/forgot-password", { method: "POST", body: Object.fromEntries(new FormData(e.target)) }));
          $("#msg").innerHTML = `<div class="notice good">${esc(r.message)}${r.email_enabled ? "" : "<br><br>Email delivery isn't configured on this site yet. Please contact support on WhatsApp to reset your password."}</div>`;
        } catch (x) { err(x); }
      };
      if ($("#gbtn")) initGoogle(cfg.google_client_id, done, err);
    };
    draw();
    return;
  }

  function initGoogle(clientId, done, err) {
    const go = () => {
      if (!window.google || !google.accounts) return setTimeout(go, 200);
      google.accounts.id.initialize({
        client_id: clientId, ux_mode: "popup",
        callback: async (r) => { try { await api("/api/auth/google", { method: "POST", body: { credential: r.credential } }); done(); } catch (x) { err(x); } },
      });
      google.accounts.id.renderButton($("#gbtn"), { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", width: 300 });
    };
    go();
  }

  // ---- token pages under /account that don't need login ----
  if (path === "/account/reset-password") {
    $("#app").innerHTML = `<div class="wrap pg"><div class="auth card"><h2 style="font-size:1.5rem">Choose a new password</h2>
      <form id="rp" style="margin-top:14px"><label>New password</label><input name="password" type="password" required minlength="8" autocomplete="new-password"><label>Confirm password</label><input name="confirm" type="password" required minlength="8" autocomplete="new-password"><button class="btn p block">Update password</button></form><div id="msg" style="margin-top:12px"></div></div></div>`;
    $("#rp").onsubmit = async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      if (d.password !== d.confirm) { $("#msg").innerHTML = '<div class="notice bad">Passwords do not match</div>'; return; }
      try { await busy(e.target.querySelector("button"), () => api("/api/auth/reset-password", { method: "POST", body: { token: sp.get("token"), password: d.password } })); $("#app .auth").innerHTML = '<h2 style="font-size:1.5rem">Password updated</h2><p class="muted" style="margin:8px 0 14px">You can now log in with your new password.</p><a class="btn p" href="/login">Log in</a>'; }
      catch (x) { $("#msg").innerHTML = `<div class="notice bad">${esc(x.message)}</div>`; }
    };
    return;
  }
  if (path === "/account/verify") {
    $("#app").innerHTML = '<div class="wrap pg"><div class="auth card" id="vbox"><p class="muted">Verifying…</p></div></div>';
    try { await api("/api/auth/verify-email", { method: "POST", body: { token: sp.get("token") } }); $("#vbox").innerHTML = '<h2 style="font-size:1.5rem">Email verified</h2><p class="muted" style="margin:8px 0 14px">Thanks for confirming your email.</p><a class="btn p" href="/account">Go to my account</a>'; }
    catch (x) { $("#vbox").innerHTML = `<h2 style="font-size:1.5rem">Link expired</h2><p class="muted" style="margin:8px 0 14px">${esc(x.message)}</p><a class="btn" href="/account">My account</a>`; }
    return;
  }

  // ======================= DASHBOARD =======================
  const user = await me();
  if (!user) { location.replace(loginUrl()); return; }
  const TABS = [["", "Overview"], ["orders", "Orders"], ["payments", "Payments"], ["wishlist", "Wishlist"], ["addresses", "Addresses"], ["notifications", "Notifications"], ["recent", "Recently viewed"], ["profile", "Profile & security"]];
  $("#app").innerHTML = `<div class="wrap pg"><div class="acct"><aside class="side" id="side">${TABS.map(([k, t]) => `<a href="/account${k ? "/" + k : ""}" data-tab="${k}">${t}${k === "notifications" ? ' <span class="badge" id="nb" style="position:static" hidden></span>' : ""}</a>`).join("")}<a href="#" id="logout">Log out</a></aside><div id="pane"></div></div></div>`;

  // Client-side routing inside /account with real URLs (refresh + back/forward work)
  $("#side").addEventListener("click", (e) => {
    const a = e.target.closest("a[data-tab]");
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault(); history.pushState(null, "", a.getAttribute("href")); route();
  });
  $("#pane").addEventListener("click", (e) => {
    const a = e.target.closest("a[href^='/account']");
    if (!a || e.metaKey || e.ctrlKey || a.target || a.hasAttribute("download")) return;
    e.preventDefault(); history.pushState(null, "", a.getAttribute("href")); route();
  });
  addEventListener("popstate", route);
  $("#logout").onclick = async (e) => { e.preventDefault(); await api("/api/auth/logout", { method: "POST" }); location.href = "/"; };

  const pane = (h) => { $("#pane").innerHTML = h; scrollTo({ top: 0 }); };
  const loading = () => pane('<div class="skel" style="height:220px"></div>');
  const ST_ORDER = ["order_placed", "payment_confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered"];
  const stBadge = (s, l) => `<span class="st ${esc(s)}">${esc(l || s.replace(/_/g, " "))}</span>`;

  async function route() {
    const parts = location.pathname.replace(/\/+$/, "").split("/").slice(2);
    const tab = parts[0] || "";
    $$("#side a[data-tab]").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
    markActive();
    loading();
    try {
      if (tab === "orders" && parts[1]) return await orderDetail(decodeURIComponent(parts[1]));
      await (VIEWS[tab] || VIEWS[""])();
    } catch (e) { pane(`<div class="notice bad">${esc(e.message)}</div>`); }
  }

  const orderRow = (o) => `<a class="o" href="/account/orders/${esc(o.order_number)}">${o.image ? img(o.image, "", { w: 120, sizes: "56px" }) : "<span></span>"}
    <div><b>${esc(o.order_number)}</b><div class="tiny muted">${fmtDate(o.created_at)} · ${o.item_count} item${o.item_count === 1 ? "" : "s"} · ${inr(o.total)}</div></div>${stBadge(o.status, o.status_label)}</a>`;

  const VIEWS = {
    async ""() {
      const { user: u, stats } = await api("/api/account/profile");
      const orders = await api("/api/account/orders");
      const nb = $("#nb"); if (stats.unread_notifications) { nb.hidden = false; nb.textContent = stats.unread_notifications; }
      pane(`<h1>Hi, ${esc(u.name.split(" ")[0])}</h1><p class="muted small" style="margin:4px 0 16px">${esc(u.email)} · Member since ${fmtDate(u.created_at)}</p>
        ${!u.email_verified ? `<div class="notice warn" style="margin-bottom:14px">Please verify your email address. <button class="btn sm" id="rv" style="margin-left:6px">Resend link</button></div>` : ""}
        <div class="stat-g">${[["Total orders", stats.orders], ["Current", stats.current_orders || 0], ["Delivered", stats.delivered || 0], ["Cancelled", stats.cancelled || 0], ["Returned", stats.returned || 0], ["Total spent", inr(stats.spent)]].map(([t, v]) => `<div class="card"><b>${v}</b><span>${t}</span></div>`).join("")}</div>
        <div class="sec-h" style="margin-top:24px"><h2 style="font-size:1.3rem">Recent orders</h2><a class="link small" href="/account/orders">View all</a></div>
        <div class="olist" style="margin-top:10px">${orders.slice(0, 4).map(orderRow).join("") || '<p class="muted">No orders yet. <a class="link" href="/products">Start shopping</a></p>'}</div>`);
      const rv = $("#rv"); if (rv) rv.onclick = async () => { const r = await busy(rv, () => api("/api/auth/resend-verification", { method: "POST" })); toast(r.sent ? "Verification email sent" : "Email isn't configured yet. Contact support.", r.sent ? "ok" : "er"); };
    },
    async orders() {
      const f = new URLSearchParams(location.search).get("filter") || "";
      const list = await api("/api/account/orders" + (f ? "?filter=" + f : ""));
      pane(`<h1>My orders</h1><div class="pills" style="margin:14px 0">${[["", "All"], ["current", "Current"], ["completed", "Delivered"], ["cancelled", "Cancelled"], ["returned", "Returned"], ["pending", "Awaiting payment"]].map(([k, t]) => `<a href="/account/orders${k ? "?filter=" + k : ""}" class="${f === k ? "on" : ""}">${t}</a>`).join("")}</div>
        <div class="olist">${list.map(orderRow).join("") || '<div class="empty"><h3>No orders here</h3><p><a class="link" href="/products">Shop now</a></p></div>'}</div>`);
    },
    async payments() {
      const { payments, refunds } = await api("/api/account/payments");
      pane(`<h1>Payments</h1><div class="card" style="margin-top:14px;padding:0"><div class="tblw"><table class="t"><thead><tr><th>Date</th><th>Order</th><th>Transaction ID</th><th>Method</th><th>Amount</th><th>Coupon</th><th>Status</th></tr></thead><tbody>
        ${payments.map((p) => `<tr><td>${fmtDate(p.paid_at || p.created_at, 1)}</td><td><a class="link" href="/account/orders/${esc(p.order_number)}">${esc(p.order_number)}</a></td><td class="tiny">${esc(p.razorpay_payment_id || "-")}</td><td>${esc(p.method || "-")}</td><td>${inr(p.amount)}</td><td>${p.coupon_code ? `${esc(p.coupon_code)} (−${inr(p.discount)})` : "-"}</td><td>${stBadge(p.status)}${p.status === "failed" && p.error_description ? `<div class="tiny muted">${esc(p.error_description)}</div>` : ""}</td></tr>`).join("") || '<tr><td colspan="7" class="muted">No transactions yet.</td></tr>'}</tbody></table></div></div>
        <h2 style="font-size:1.3rem;margin-top:24px">Refunds</h2><div class="card" style="margin-top:10px;padding:0"><div class="tblw"><table class="t"><thead><tr><th>Date</th><th>Order</th><th>Refund ID</th><th>Amount</th><th>Status</th></tr></thead><tbody>
        ${refunds.map((r) => `<tr><td>${fmtDate(r.created_at)}</td><td>${esc(r.order_number)}</td><td class="tiny">${esc(r.razorpay_refund_id || "-")}</td><td>${inr(r.amount)}</td><td>${stBadge(r.status === "processed" ? "successful" : "pending", r.status)}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">No refunds.</td></tr>'}</tbody></table></div></div>`);
    },
    async wishlist() {
      const list = await api("/api/account/wishlist");
      pane(`<h1>Wishlist</h1>${list.length ? `<div class="grid">${list.map((p) => card(p).replace('<div class="pa">', `<div class="pa"><button class="btn sm" data-unwish="${p.id}">Remove</button>`)).join("")}</div>` : '<div class="empty"><h3>Your wishlist is empty</h3><p>Tap the heart on a product to save it.</p></div>'}`);
      HM.reveal();
      $$("[data-unwish]").forEach((b) => (b.onclick = async () => { await busy(b, () => api("/api/account/wishlist/" + b.dataset.unwish, { method: "DELETE" })); VIEWS.wishlist(); }));
    },
    async recent() {
      const list = await api("/api/account/recently-viewed");
      pane(`<h1>Recently viewed</h1>${list.length ? `<div class="grid">${list.map((p) => card(p)).join("")}</div>` : '<div class="empty"><p>Products you view will appear here.</p></div>'}`);
      HM.reveal();
    },
    async notifications() {
      const list = await api("/api/account/notifications");
      pane(`<div class="sec-h"><h1>Notifications</h1>${list.some((n) => !n.read_at) ? '<button class="btn sm" id="mr">Mark all read</button>' : ""}</div>
        <div style="margin-top:14px">${list.map((n) => `<div class="card" style="margin-bottom:8px;padding:12px 14px;${n.read_at ? "opacity:.7" : "border-color:#ff6a0055"}"><div class="row" style="justify-content:space-between"><b>${esc(n.title)}</b><span class="tiny muted">${fmtDate(n.created_at, 1)}</span></div>${n.body ? `<p class="small" style="margin-top:4px">${esc(n.body)}</p>` : ""}${n.link && n.link.startsWith("/") ? `<a class="link small" href="${esc(n.link)}">View</a>` : ""}</div>`).join("") || '<p class="muted">No notifications yet.</p>'}</div>`);
      const mr = $("#mr"); if (mr) mr.onclick = async () => { await api("/api/account/notifications/read", { method: "POST" }); $("#nb").hidden = true; VIEWS.notifications(); };
    },
    async addresses() {
      const list = await api("/api/account/addresses");
      const form = (a = {}) => `<form class="card fg" id="af" data-id="${a.id || ""}" style="margin-top:12px"><h3 class="full" style="margin-bottom:8px">${a.id ? "Edit address" : "New address"}</h3>
        <div><label>Full name</label><input name="name" required value="${esc(a.name || user.name)}"></div><div><label>Mobile</label><input name="phone" required type="tel" inputmode="numeric" value="${esc(a.phone || "")}"></div>
        <div class="full"><label>Address line 1</label><input name="line1" required value="${esc(a.line1 || "")}"></div><div class="full"><label>Address line 2</label><input name="line2" value="${esc(a.line2 || "")}"></div>
        <div><label>City</label><input name="city" required value="${esc(a.city || "")}"></div><div><label>State</label><input name="state" required value="${esc(a.state || "")}"></div>
        <div><label>Pincode</label><input name="pincode" required pattern="[1-9][0-9]{5}" inputmode="numeric" maxlength="6" value="${esc(a.pincode || "")}"></div><div><label>Label</label><input name="label" placeholder="Home, Work…" value="${esc(a.label || "")}"></div>
        <label class="check full"><input type="checkbox" name="is_default" ${a.is_default ? "checked" : ""}> Make this my default address</label>
        <div class="full row"><button class="btn p sm">Save address</button><button type="button" class="btn sm" id="afc">Cancel</button></div></form>`;
      pane(`<div class="sec-h"><h1>Addresses</h1><button class="btn sm p" id="na">+ Add address</button></div><div id="afw"></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">${list.map((a) => `<div class="card"><b>${esc(a.name)}</b> ${a.is_default ? '<span class="tag ok">Default</span>' : ""} ${a.label ? `<span class="tag grey">${esc(a.label)}</span>` : ""}
          <p class="small" style="margin-top:6px">${esc(a.line1)}${a.line2 ? ", " + esc(a.line2) : ""}<br>${esc(a.city)}, ${esc(a.state)} - ${esc(a.pincode)}<br>Phone: ${esc(a.phone)}</p>
          <div class="row" style="margin-top:10px"><button class="btn sm" data-ed="${a.id}">Edit</button><button class="btn sm ghost" data-del="${a.id}">Delete</button></div></div>`).join("") || '<p class="muted">No saved addresses.</p>'}</div>`);
      const open = (a) => {
        $("#afw").innerHTML = form(a);
        $("#afc").onclick = () => ($("#afw").innerHTML = "");
        $("#af").onsubmit = async (e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.target)); d.is_default = !!d.is_default;
          const id = e.target.dataset.id;
          await busy(e.target.querySelector(".btn.p"), () => api("/api/account/addresses" + (id ? "/" + id : ""), { method: id ? "PUT" : "POST", body: d }));
          toast("Address saved", "ok"); VIEWS.addresses();
        };
      };
      $("#na").onclick = () => open();
      $$("[data-ed]").forEach((b) => (b.onclick = () => open(list.find((a) => a.id === +b.dataset.ed))));
      $$("[data-del]").forEach((b) => (b.onclick = async () => { if (!confirm("Delete this address?")) return; await busy(b, () => api("/api/account/addresses/" + b.dataset.del, { method: "DELETE" })); VIEWS.addresses(); }));
    },
    async profile() {
      const { user: u } = await api("/api/account/profile");
      pane(`<h1>Profile &amp; security</h1>
        <form class="card fg" id="pf" style="margin-top:14px"><h3 class="full" style="margin-bottom:8px">Personal details</h3>
          <div><label>Full name</label><input name="name" required value="${esc(u.name)}"></div><div><label>Mobile</label><input name="phone" type="tel" inputmode="numeric" value="${esc(u.phone || "")}"></div>
          <div class="full"><label>Email ${u.email_verified ? '<span class="tag ok">Verified</span>' : '<span class="tag">Not verified</span>'}</label><input name="email" type="email" required value="${esc(u.email)}"></div>
          <div class="full" id="cpw" hidden><label>Current password (required to change email)</label><input name="current_password" type="password" autocomplete="current-password"></div>
          <div class="full"><button class="btn p sm">Save changes</button></div></form>
        <form class="card" id="pw" style="margin-top:14px;max-width:520px"><h3 style="margin-bottom:8px">${u.has_password ? "Change password" : "Set a password"}</h3>
          ${u.has_password ? '<label>Current password</label><input name="current_password" type="password" required autocomplete="current-password">' : '<p class="muted small" style="margin-bottom:10px">You sign in with Google. Set a password to also log in with email.</p>'}
          <label>New password</label><input name="new_password" type="password" required minlength="8" autocomplete="new-password"><button class="btn p sm">Update password</button>
          <p class="tiny muted" style="margin-top:8px">Changing your password signs you out on other devices.</p></form>
        <div class="card" style="margin-top:14px;max-width:520px"><h3>Sign-in methods</h3><p class="small" style="margin-top:6px">Email &amp; password: ${u.has_password ? "enabled" : "not set"}<br>Google: ${u.google_linked ? "linked" : "not linked"}</p></div>`);
      const pf = $("#pf");
      pf.email.oninput = () => ($("#cpw").hidden = pf.email.value.trim().toLowerCase() === u.email);
      pf.onsubmit = async (e) => { e.preventDefault(); await busy(pf.querySelector("button"), () => api("/api/account/profile", { method: "PUT", body: Object.fromEntries(new FormData(pf)) })); toast("Profile updated", "ok"); me(true); VIEWS.profile(); };
      $("#pw").onsubmit = async (e) => { e.preventDefault(); await busy(e.target.querySelector("button"), () => api("/api/account/password", { method: "POST", body: Object.fromEntries(new FormData(e.target)) })); e.target.reset(); toast("Password updated", "ok"); };
    },
  };

  async function orderDetail(number) {
    const o = await api("/api/account/orders/" + encodeURIComponent(number));
    const placed = sp.get("placed") && o.payment_status === "successful";
    const step = ST_ORDER.indexOf(o.status);
    const pay = o.payments.find((p) => p.status !== "pending" && p.status !== "failed") || o.payments[o.payments.length - 1];
    const s = o.shipment;
    const showTrack = !["cancelled", "returned", "pending_payment"].includes(o.status);
    pane(`${placed ? `<div class="notice good" style="margin-bottom:14px"><b>Thank you! Your order is confirmed.</b><br>We've received your payment of ${inr(o.total)}. You'll get updates here and by email.</div>` : ""}
      <a class="link small" href="/account/orders">← All orders</a>
      <div class="sec-h" style="margin-top:8px"><div><h1>Order ${esc(o.order_number)}</h1><p class="muted small">Placed ${fmtDate(o.created_at, 1)}</p></div><div class="row">${stBadge(o.status, o.status_label)}${stBadge(o.payment_status, "Payment " + o.payment_status.replace(/_/g, " "))}</div></div>
      ${o.status === "pending_payment" ? `<div class="notice warn" style="margin-top:12px">This order is awaiting payment. Items are held until ${fmtDate(o.reservation_expires_at, 1)}.<div class="row" style="margin-top:10px"><button class="btn p sm" id="payNow">Complete payment</button><button class="btn sm" id="cxlP">Cancel order</button></div></div>` : ""}
      ${showTrack ? `<div class="card" style="margin-top:14px"><h3>Tracking</h3><div class="otrack">${ST_ORDER.slice(1).map((k, i) => `<div class="${step >= i + 1 ? "done" : ""}">${esc({ payment_confirmed: "Confirmed", processing: "Processing", packed: "Packed", shipped: "Shipped", out_for_delivery: "Out for delivery", delivered: "Delivered" }[k])}</div>`).join("")}</div>
        ${s && (s.courier || s.tracking_id) ? `<p class="small" style="margin-top:10px">Courier: <b>${esc(s.courier || "-")}</b> · Tracking ID: <b>${esc(s.tracking_id || "-")}</b>${s.status ? ` · ${esc(s.status)}` : ""}${s.estimated_delivery ? ` · Expected by <b>${fmtDate(s.estimated_delivery)}</b>` : ""}</p>${s.tracking_url ? `<a class="btn sm" style="margin-top:8px" target="_blank" rel="noopener" href="${esc(s.tracking_url)}">Track on courier website</a>` : ""}${s.notes ? `<p class="small muted" style="margin-top:6px">${esc(s.notes)}</p>` : ""}`
        : '<p class="small muted" style="margin-top:10px">Courier and tracking details will appear here once your order ships.</p>'}</div>` : ""}
      <div class="cart od" style="margin-top:14px"><div class="card"><h3 style="margin-bottom:8px">Items</h3>
        ${o.items.map((it) => `<div class="cl" style="grid-template-columns:64px 1fr auto">${it.image_url ? img(it.image_url, it.product_name, { w: 160, sizes: "64px", attrs: 'style="width:64px;height:64px"' }) : "<span></span>"}<div><a class="nm" href="/products/${esc(it.product_slug || "")}">${esc(it.product_name)}</a><div class="meta">${it.flavour ? esc(it.flavour) + " · " : ""}Qty ${it.quantity} × ${inr(it.unit_price)}</div>
          ${o.status === "delivered" && it.product_id ? `<button class="btn sm ghost" style="padding:0;height:auto;margin-top:4px;color:#ff7a4d" data-review="${it.product_id}" data-name="${esc(it.product_name)}">Write a review</button>` : ""}</div><b>${inr(it.line_total)}</b></div>`).join("")}
        <div id="rvf"></div>
        <h3 style="margin:16px 0 6px">History</h3><ul class="tl">${o.history.map((h) => `<li>${esc(h.note || h.status.replace(/_/g, " "))}<small>${fmtDate(h.created_at, 1)}</small></li>`).join("")}</ul></div>
      <aside><div class="card"><h3 style="margin-bottom:8px">Payment</h3>
        <div class="sumrow"><span>Subtotal</span><span>${inr(o.subtotal)}</span></div>${o.discount ? `<div class="sumrow"><span>Coupon ${esc(o.coupon_code || "")}</span><span class="neg">− ${inr(o.discount)}</span></div>` : ""}
        <div class="sumrow"><span>Shipping</span><span>${o.shipping_fee ? inr(o.shipping_fee) : "Free"}</span></div><div class="sumrow tot"><span>Total</span><span>${inr(o.total)}</span></div>
        ${o.refunded_amount ? `<div class="sumrow"><span>Refunded</span><span>${inr(o.refunded_amount)}</span></div>` : ""}
        ${pay && pay.razorpay_payment_id ? `<p class="tiny muted" style="margin-top:8px">Transaction ID: ${esc(pay.razorpay_payment_id)}${pay.method ? ` · ${esc(pay.method)}` : ""}${pay.paid_at ? `<br>Paid ${fmtDate(pay.paid_at, 1)}` : ""}</p>` : ""}
        ${o.refunds.length ? `<p class="tiny muted" style="margin-top:8px">${o.refunds.map((r) => `Refund ${inr(r.amount)}: ${esc(r.status)} (${fmtDate(r.created_at)})`).join("<br>")}</p>` : ""}
        ${o.paid_at ? `<a class="btn sm block" style="margin-top:12px" href="/api/account/orders/${esc(o.order_number)}/invoice" download>Download invoice (PDF)</a>` : ""}</div>
        <div class="card" style="margin-top:12px"><h3 style="margin-bottom:6px">Delivery address</h3><p class="small">${esc(o.ship_name)}<br>${esc(o.ship_line1)}${o.ship_line2 ? ", " + esc(o.ship_line2) : ""}<br>${esc(o.ship_city)}, ${esc(o.ship_state)} - ${esc(o.ship_pincode)}<br>Phone: ${esc(o.ship_phone)}</p></div>
        ${o.can_cancel ? '<button class="btn sm block" id="cxl" style="margin-top:12px">Cancel order</button>' : ""}
        ${o.cancel_reason ? `<p class="tiny muted" style="margin-top:8px">Cancellation reason: ${esc(o.cancel_reason)}</p>` : ""}</aside></div>`);

    const cx = $("#cxl");
    if (cx) cx.onclick = async () => {
      const reason = prompt("Reason for cancelling (optional):", "");
      if (reason === null) return;
      const r = await busy(cx, () => api(`/api/account/orders/${encodeURIComponent(o.order_number)}/cancel`, { method: "POST", body: { reason } }));
      toast(r.refund ? `Order cancelled. Refund of ${inr(r.refund.amount)} initiated.` : r.refund_error ? "Order cancelled. Our team will process your refund shortly." : "Order cancelled", "ok");
      orderDetail(number);
    };
    const pn = $("#payNow");
    if (pn) pn.onclick = async () => {
      const x = await busy(pn, () => api(`/api/checkout/${encodeURIComponent(o.order_number)}/pay`));
      if (!window.Razorpay) { toast("Payment window could not load", "er"); return; }
      const rz = new window.Razorpay({ key: x.razorpay.key, order_id: x.razorpay.order_id, amount: x.razorpay.amount, currency: "INR", name: x.razorpay.name, description: x.razorpay.description, prefill: x.razorpay.prefill, theme: { color: "#ff2525" },
        handler: async (resp) => { try { await api("/api/checkout/verify", { method: "POST", body: resp }); } catch (e) { toast(e.message, "er"); } location.replace(`/account/orders/${encodeURIComponent(o.order_number)}?placed=1`); } });
      rz.on("payment.failed", (r) => toast("Payment failed: " + ((r.error && r.error.description) || "try again"), "er"));
      rz.open();
    };
    const cp = $("#cxlP");
    if (cp) cp.onclick = async () => { if (!confirm("Cancel this unpaid order?")) return; await busy(cp, () => api(`/api/checkout/${encodeURIComponent(o.order_number)}/cancel`, { method: "POST" })); orderDetail(number); };
    $$("[data-review]").forEach((b) => (b.onclick = () => {
      $("#rvf").innerHTML = `<form class="card" id="rform" style="margin-top:12px;background:var(--panel2)"><h3 style="font-size:1rem">Review ${esc(b.dataset.name)}</h3>
        <label>Rating</label><select name="rating">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${"★".repeat(n)} (${n})</option>`).join("")}</select>
        <label>Title</label><input name="title" maxlength="160"><label>Your review</label><textarea name="body" rows="3" required minlength="10" maxlength="3000"></textarea><button class="btn p sm">Submit review</button></form>`;
      $("#rform").onsubmit = async (e) => {
        e.preventDefault();
        const r = await busy(e.target.querySelector("button"), () => api("/api/account/reviews", { method: "POST", body: { ...Object.fromEntries(new FormData(e.target)), product_id: +b.dataset.review } }));
        $("#rvf").innerHTML = `<div class="notice good" style="margin-top:12px">${esc(r.message)}</div>`;
      };
    }));
  }

  route();
};
