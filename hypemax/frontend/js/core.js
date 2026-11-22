/* HYPEMAX Nutrition storefront core: shared by every page. No build step; plain browser JS. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inr = (p) => "₹" + (Number(p || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const fmtDate = (d, time) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", ...(time ? { hour: "numeric", minute: "2-digit" } : {}), timeZone: "Asia/Kolkata" }) : "");
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    sget(k, d) { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    sset(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  // ---------- API ----------
  const csrf = () => (document.cookie.match(/(?:^|;\s*)hm_csrf=([a-f0-9]+)/) || [])[1] || "";
  async function api(path, opts = {}) {
    const method = (opts.method || "GET").toUpperCase();
    const headers = { Accept: "application/json" };
    let body = opts.body;
    if (body && !(body instanceof FormData)) { headers["Content-Type"] = "application/json"; body = JSON.stringify(body); }
    if (method !== "GET") {
      if (!csrf()) await fetch("/api/config", { credentials: "same-origin" }).catch(() => {});
      headers["X-CSRF-Token"] = csrf();
    }
    let r;
    try { r = await fetch(path.startsWith("/") ? path : "/api/" + path, { method, headers, body, credentials: "same-origin" }); }
    catch { throw Object.assign(new Error("Network error. Check your connection and try again."), { status: 0 }); }
    const ct = r.headers.get("content-type") || "";
    const data = ct.includes("json") ? await r.json().catch(() => ({})) : r.status === 204 ? {} : await r.text();
    if (!r.ok) throw Object.assign(new Error((data && data.error) || `Request failed (${r.status})`), { status: r.status, code: data && data.code, data });
    return data;
  }

  // ---------- toast ----------
  function toast(msg, type) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.append(t); }
    t.textContent = msg; t.className = "show " + (type || "");
    clearTimeout(t._t); t._t = setTimeout(() => (t.className = ""), 3600);
  }
  /** Run an async action with a busy button and toast on error. */
  async function busy(btn, fn) {
    if (btn) btn.classList.add("busy");
    try { return await fn(); } catch (e) { toast(e.message, "er"); throw e; } finally { if (btn) btn.classList.remove("busy"); }
  }

  // ---------- images (Cloudinary f_auto/q_auto + responsive widths) ----------
  const cld = (url, w) => {
    if (!url) return "";
    if (/res\.cloudinary\.com\/.+\/image\/upload\//.test(url) && !/\/upload\/[^/]*(f_auto|q_auto)/.test(url))
      return url.replace("/image/upload/", `/image/upload/f_auto,q_auto,c_limit,w_${w}/`);
    return url;
  };
  const srcset = (url, widths = [320, 480, 720, 960, 1280]) => (/res\.cloudinary\.com/.test(url) ? widths.map((w) => `${cld(url, w)} ${w}w`).join(", ") : "");
  const img = (url, alt, { w = 600, sizes = "(max-width:640px) 50vw, 300px", cls = "", eager = false, attrs = "" } = {}) => {
    if (!url) return "";
    const ss = srcset(url);
    return `<img src="${esc(cld(url, w))}"${ss ? ` srcset="${esc(ss)}" sizes="${esc(sizes)}"` : ""} alt="${esc(alt || "")}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"${cls ? ` class="${cls}"` : ""} ${attrs}>`;
  };

  // ---------- icons ----------
  const I = {
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.3-9.2C1.4 8.4 3.6 5 7 5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8C19.5 16.4 12 21 12 21z"/></svg>',
    bag: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
    left: '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
    truck: '<svg viewBox="0 0 24 24"><path d="M3 6h11v9H3zM14 9h4l3 3v3h-7"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
    lab: '<svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4A1.5 1.5 0 0 0 19 19l-5-10V3"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4z"/></svg>',
    ig: '<svg viewBox="0 0 24 24"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm5 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm6-1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/></svg>',
    fb: '<svg viewBox="0 0 24 24"><path d="M14 8h3V4h-3c-2.8 0-4 1.8-4 4.5V11H7v4h3v7h4v-7h3l1-4h-4V8.6c0-.4.3-.6.6-.6z"/></svg>',
    yt: '<svg viewBox="0 0 24 24"><path d="M22 8.2a3 3 0 0 0-2.1-2.1C18 5.6 12 5.6 12 5.6s-6 0-7.9.5A3 3 0 0 0 2 8.2 31 31 0 0 0 1.6 12 31 31 0 0 0 2 15.8a3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5a3 3 0 0 0 2.1-2.1c.3-1.2.4-2.5.4-3.8s-.1-2.6-.4-3.8zM10 15V9l5.2 3z"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M17.5 3h3.2l-7 8 8.3 10h-6.5l-5-6.2L4.6 21H1.4l7.5-8.6L1 3h6.6l4.6 5.7zm-1.1 16h1.8L6.7 4.9H4.8z"/></svg>',
    in: '<svg viewBox="0 0 24 24"><path d="M4.5 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM3 9h3v12H3zm6 0h3v1.7c.5-.9 1.7-2 3.6-2 3.3 0 4.4 2 4.4 5.5V21h-3v-6c0-1.6-.3-3-2.1-3-1.9 0-2.4 1.3-2.4 3V21H9z"/></svg>',
    wa: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm5.2 13.9c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.3-.8-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.4.5c-.1.1-.3.3-.1.6.1.3.7 1.1 1.4 1.8.9.8 1.7 1.1 2 1.2.3.1.4.1.6-.1l.8-1c.2-.3.4-.2.6-.1l2 .9c.3.1.5.2.5.3.1.1.1.7-.1 1.4z"/></svg>',
  };

  // ---------- site data ----------
  let SITE = null, CONFIG = null, ME;
  const site = () => (SITE ||= api("/api/site").catch(() => ({ settings: {}, homepage: {}, banners: [], categories: [] })));
  const config = () => (CONFIG ||= api("/api/config").catch(() => ({ features: {} })));
  const me = async (force) => {
    if (ME === undefined || force) ME = (await config()).user || null;
    if (force) { CONFIG = null; ME = (await config()).user || null; }
    return ME;
  };
  const waLink = (s, text) => `https://wa.me/${encodeURIComponent((s && s.whatsapp) || "919984472222")}?text=${encodeURIComponent(text)}`;

  // ---------- navigation & active route ----------
  const NAV = [["/", "Home", "home"], ["/products", "Shop", "products"], ["/about", "About Us", "about"], ["/faq", "FAQ", "faq"], ["/contact", "Contact Us", "contact"]];
  /** Which main nav item a path belongs to. Supports nested routes (/products/x -> products). */
  function routeKey(path = location.pathname) {
    const p = (path.replace(/\/+$/, "") || "/").toLowerCase();
    if (p === "/" || p === "/index.html") return "home";
    if (p.startsWith("/products") || p.startsWith("/product")) return "products";
    if (p.startsWith("/about")) return "about";
    if (p.startsWith("/faq")) return "faq";
    if (p.startsWith("/contact")) return "contact";
    if (p.startsWith("/account") || p === "/login" || p === "/register" || p === "/forgot-password") return "account";
    if (p.startsWith("/cart") || p.startsWith("/checkout")) return "cart";
    return null;
  }
  function markActive() {
    const k = routeKey();
    $$("nav.links a").forEach((a) => { const on = a.dataset.k === k; a.classList.toggle("on", on); on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"); });
    $$(".tools [data-k]").forEach((a) => a.classList.toggle("on", a.dataset.k === k));
  }
  // Back/forward (incl. pages restored from the bfcache) must re-evaluate the active item.
  addEventListener("popstate", markActive);
  addEventListener("pageshow", markActive);

  async function shell() {
    const { settings: S = {}, categories = [], images = {} } = await site();
    const logo = images.logo || "/img/logo.png";
    const top = document.createElement("div");
    top.innerHTML = `${S.announcement ? `<div class="bar">${esc(S.announcement)}</div>` : ""}
<header class="top"><div class="wrap">
  <button class="icon-btn burger" aria-label="Open menu" aria-expanded="false">${I.menu}</button>
  <a class="logo" href="/" aria-label="HYPEMAX Nutrition home"><img src="${esc(logo)}" alt="HYPEMAX Nutrition" width="96" height="38"></a>
  <nav class="links" aria-label="Main">${NAV.map(([h, t, k]) => `<a href="${h}" data-k="${k}">${t}</a>`).join("")}</nav>
  <div class="tools">
    <button class="icon-btn" id="sbtn" aria-label="Search">${I.search}</button>
    <a class="icon-btn" href="/account/wishlist" aria-label="Wishlist">${I.heart}</a>
    <a class="icon-btn" href="/account" data-k="account" aria-label="My account">${I.user}</a>
    <a class="icon-btn" href="/cart" data-k="cart" aria-label="Cart">${I.bag}<span class="badge" id="cc" hidden>0</span></a>
  </div></div>
  <div class="search-pop" id="spop"><div class="wrap"><form action="/products" role="search"><input name="q" type="search" placeholder="Search products" aria-label="Search products"><button class="btn p">Search</button></form></div></div>
</header>`;
    document.body.prepend(...top.children);
    markActive();
    const links = $("nav.links"), burger = $(".burger");
    burger.onclick = () => { const o = links.classList.toggle("o"); burger.setAttribute("aria-expanded", o); burger.innerHTML = o ? I.close : I.menu; };
    links.addEventListener("click", () => { links.classList.remove("o"); burger.innerHTML = I.menu; });
    $("#sbtn").onclick = () => { $("#spop").classList.toggle("o"); $("#spop input").focus(); };

    const soc = [["instagram", I.ig], ["facebook", I.fb], ["youtube", I.yt], ["twitter", I.x], ["linkedin", I.in]].filter(([k]) => S[k]);
    const f = document.createElement("footer");
    f.innerHTML = `<div class="wrap"><div class="fgrid">
  <div class="fb"><a class="logo" href="/"><img src="${esc(logo)}" alt="HYPEMAX Nutrition" width="96" height="38" loading="lazy"></a>
    <p style="margin-top:10px;max-width:300px">${esc(S.footerText || "Premium sports nutrition for people who train with intent.")}</p>
    ${soc.length ? `<div class="soc">${soc.map(([k, ic]) => `<a href="${esc(S[k])}" target="_blank" rel="noopener" aria-label="${k}">${ic}</a>`).join("")}</div>` : ""}</div>
  <div><h4>Shop</h4><a href="/products">All products</a>${categories.slice(0, 4).map((c) => `<a href="/products?category=${esc(c.slug)}">${esc(c.name)}</a>`).join("")}</div>
  <div><h4>Help</h4><a href="/account/orders">Track order</a><a href="/faq">FAQ</a><a href="/contact">Contact us</a><a href="/about">About us</a></div>
  <div><h4>Policies</h4><a href="/policies/shipping">Shipping</a><a href="/policies/refund">Returns &amp; refunds</a><a href="/policies/privacy">Privacy</a><a href="/policies/terms">Terms</a></div>
  <div class="fn"><h4>Get in touch</h4>${S.email ? `<a href="mailto:${esc(S.email)}">${esc(S.email)}</a>` : ""}${S.phone ? `<a href="tel:+91${esc(String(S.phone).replace(/\D/g, "").slice(-10))}">+91 ${esc(S.phone)}</a>` : ""}
    <a href="${esc(waLink(S, "Hello HYPEMAX Team! I have a question."))}" target="_blank" rel="noopener">WhatsApp us</a>
    <form class="news" id="nlf"><input type="email" name="email" required placeholder="Your email" aria-label="Email for newsletter"><button class="btn p sm">Join</button></form></div>
</div>
<div class="fbot"><span>© ${new Date().getFullYear()} ${esc(S.brandName || "HYPEMAX Nutrition")}. All rights reserved.</span><div class="pay-ic" aria-label="Payment methods"><span>UPI</span><span>VISA</span><span>MASTERCARD</span><span>RUPAY</span><span>NETBANKING</span></div></div></div>`;
    document.body.append(f);
    $("#nlf").onsubmit = async (e) => {
      e.preventDefault();
      const b = e.target.querySelector("button");
      await busy(b, () => api("/api/newsletter", { method: "POST", body: { email: e.target.email.value } }));
      e.target.reset(); toast("You're subscribed. Welcome to the HYPEMAX crew!", "ok");
    };
    const wa = document.createElement("a");
    wa.className = "wa"; wa.target = "_blank"; wa.rel = "noopener"; wa.href = waLink(S, "Hello HYPEMAX Team! I have a question."); wa.setAttribute("aria-label", "Chat on WhatsApp"); wa.innerHTML = I.wa;
    document.body.append(wa);
    refreshCartCount();
  }

  async function refreshCartCount(cart) {
    try {
      const c = cart || (await api("/api/cart"));
      const el = $("#cc");
      if (el) { el.textContent = c.count; el.hidden = !c.count; }
      return c;
    } catch { return null; }
  }

  // ---------- reusable accordion ----------
  /** Render section content: "- " bullets, "a | b" table rows, blank line = new paragraph. Escaped. */
  function richText(src) {
    const blocks = String(src || "").replace(/\r/g, "").split(/\n\s*\n/);
    return blocks.map((b) => {
      const lines = b.split("\n").filter((l) => l.trim());
      if (!lines.length) return "";
      if (lines.every((l) => /^\s*[-•]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${esc(l.replace(/^\s*[-•]\s+/, ""))}</li>`).join("")}</ul>`;
      const out = []; let i = 0;
      while (i < lines.length) {
        if (lines[i].includes(" | ")) {
          const rows = [];
          while (i < lines.length && lines[i].includes(" | ")) rows.push(lines[i++].split(" | ").map((c) => c.trim()));
          const cols = Math.max(...rows.map((r) => r.length));
          out.push(cols >= 3
            ? `<div class="tblw"><table><thead><tr>${rows[0].map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
            : `<table class="kv"><tbody>${rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r.slice(1).join(" | "))}</td></tr>`).join("")}</tbody></table>`);
        } else if (/^\s*[-•]\s+/.test(lines[i])) {
          const li = [];
          while (i < lines.length && /^\s*[-•]\s+/.test(lines[i])) li.push(lines[i++].replace(/^\s*[-•]\s+/, ""));
          out.push(`<ul>${li.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`);
        } else {
          const p = [];
          while (i < lines.length && !lines[i].includes(" | ") && !/^\s*[-•]\s+/.test(lines[i])) p.push(esc(lines[i++]));
          out.push(`<p>${p.join("<br>")}</p>`);
        }
      }
      return out.join("");
    }).join("");
  }
  let accSeq = 0;
  /** items: [{title, content|html}] -> collapsed accordion. Whole header is the toggle. */
  function accordion(items, { open = -1 } = {}) {
    return `<div class="acc">${items.map((it, i) => {
      const id = "acc" + ++accSeq;
      return `<div class="acc-i${i === open ? " open" : ""}"><button class="acc-h" type="button" aria-expanded="${i === open}" aria-controls="${id}"><span>${esc(it.title)}</span>${I.chev}</button>
      <div class="acc-p" id="${id}" role="region"><div><div class="acc-c">${it.html != null ? it.html : richText(it.content)}</div></div></div></div>`;
    }).join("")}</div>`;
  }
  document.addEventListener("click", (e) => {
    const h = e.target.closest(".acc-h");
    if (!h) return;
    const i = h.parentElement, o = i.classList.toggle("open");
    h.setAttribute("aria-expanded", o);
  });

  // ---------- product card ----------
  const STATUS_TAG = { active: ["In stock", "ok"], out_of_stock: ["Out of stock", "grey"], upcoming: ["Upcoming", "soon"], coming_soon: ["Coming soon", "soon"], discontinued: ["Discontinued", "grey"] };
  const priceHtml = (p) => p.price ? `<div class="price"><b>${inr(p.price)}</b>${p.mrp > p.price ? `<s>${inr(p.mrp)}</s><span class="pct">${p.discount_percent}% off</span>` : ""}</div>` : `<div class="price muted small">Price announced soon</div>`;
  function card(p, { imgOverride } = {}) {
    const t = STATUS_TAG[p.status] || ["", ""];
    const url = `/products/${encodeURIComponent(p.slug)}`;
    const im = imgOverride || p.image;
    return `<article class="pc rv"><a class="pimg" href="${url}" aria-label="${esc(p.name)}">${im ? img(im, p.name, { w: 480, cls: imgOverride ? "contain" : "" }) : `<div class="ph">${esc(p.name.replace(/^HYPEMAX\s*/i, ""))}</div>`}
      ${p.status !== "active" ? `<span class="tag ${t[1]}">${t[0]}</span>` : p.low_stock ? `<span class="tag">Only ${p.low_stock} left</span>` : ""}${p.discount_percent && p.status === "active" ? `<span class="off">-${p.discount_percent}%</span>` : ""}</a>
      <div class="pb"><a class="pn" href="${url}">${esc(p.name)}</a>${p.rating ? `<div class="stars small">${"★".repeat(Math.round(p.rating.average))}<span class="muted"> (${p.rating.count})</span></div>` : ""}
      <p class="ps">${esc(p.short_description || "")}</p>${priceHtml(p)}
      <div class="pa">${p.purchasable ? `<button class="btn p" data-add="${p.id}" data-fl="${esc((p.flavours || [])[0] || "")}">Add to cart</button><a class="btn" href="${url}">View</a>` : `<a class="btn block" href="${url}">${p.status === "upcoming" || p.status === "coming_soon" ? "Coming soon" : "View details"}</a>`}</div></div></article>`;
  }
  async function addToCart(productId, flavour, quantity = 1, btn) {
    const c = await busy(btn, () => api("/api/cart/items", { method: "POST", body: { product_id: +productId, flavour: flavour || "", quantity } }));
    refreshCartCount(c);
    toast("Added to cart", "ok");
    return c;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-add]");
    if (b) addToCart(b.dataset.add, b.dataset.fl, 1, b).catch(() => {});
  });

  // ---------- accessibility: link each <label> to the field right after it ----------
  let fid = 0;
  function linkLabels(root = document) {
    root.querySelectorAll("label:not([for]):not(.check):not(.addr)").forEach((l) => {
      const f = l.nextElementSibling;
      if (f && /^(INPUT|SELECT|TEXTAREA)$/.test(f.tagName)) { if (!f.id) f.id = "f" + ++fid; l.htmlFor = f.id; }
    });
  }
  new MutationObserver(() => linkLabels()).observe(document.documentElement, { childList: true, subtree: true });

  // ---------- reveal on scroll ----------
  function reveal() {
    if (!("IntersectionObserver" in window)) return $$(".rv").forEach((x) => x.classList.add("in"));
    const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }), { threshold: 0.08 });
    $$(".rv:not(.in)").forEach((el) => {
      // Content already on screen is shown right away (never depend on the observer for above-the-fold content)
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) requestAnimationFrame(() => el.classList.add("in"));
      io.observe(el);
    });
    setTimeout(() => $$(".rv:not(.in)").forEach((el) => { const r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) el.classList.add("in"); }), 600);
  }

  // ---------- analytics (first-party, privacy-friendly) ----------
  function track(type, extra = {}) {
    const sp = new URLSearchParams(location.search);
    const body = JSON.stringify({ type, path: location.pathname, referrer: document.referrer || null, utm: sp.get("utm_source"), ...extra });
    // keepalive fetch (not sendBeacon) so the CSRF header can be attached
    fetch("/api/t", { method: "POST", keepalive: true, credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() }, body }).catch(() => {});
  }

  /** Safe same-site redirect target from ?next= */
  const nextUrl = (d = "/account") => { const n = new URLSearchParams(location.search).get("next"); return n && /^\/(?![/\\])[^\r\n]*$/.test(n) ? n : d; }; // same-site paths only ("//x" and "/\x" are off-site)
  const loginUrl = (next = location.pathname + location.search) => `/login?next=${encodeURIComponent(next)}`;

  // Recently viewed (guests: localStorage; logged-in users are also tracked server-side)
  const recent = { add(id) { const a = store.get("hm_rv", []).filter((x) => x !== id); a.unshift(id); store.set("hm_rv", a.slice(0, 12)); }, ids() { return store.get("hm_rv", []); } };

  window.HM = { $, $$, esc, inr, fmtDate, api, toast, busy, cld, img, I, site, config, me, waLink, shell, markActive, routeKey, refreshCartCount, accordion, richText, card, priceHtml, addToCart, reveal, track, nextUrl, loginUrl, recent, store };

  // Boot: build shell, then run the page module registered on HM.page
  document.addEventListener("DOMContentLoaded", async () => {
    if (!csrf()) await config();
    await shell();
    const page = window.HM_PAGE;
    if (page) {
      try { await page(); } catch (e) { console.error(e); const m = $("#app"); if (m && !m.innerHTML.trim()) m.innerHTML = `<div class="wrap pg empty"><h3>Something went wrong</h3><p>${esc(e.message)}</p><p style="margin-top:12px"><a class="btn" href="/">Go home</a></p></div>`; }
    }
    reveal();
    if (!window.HM_NO_PAGEVIEW) track("page_view");
  });
})();
