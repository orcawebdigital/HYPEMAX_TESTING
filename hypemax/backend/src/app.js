const path = require("path");
const fs = require("fs");
const express = require("express");
const cookieParser = require("cookie-parser");
const config = require("./config");
const { q, one } = require("./db");
const { securityHeaders, csrf } = require("./security");
const { loadSessions } = require("./auth");
const { HttpError } = require("./util");
const { getSettings } = require("./services/content");

const FRONTEND = path.join(__dirname, "..", "..", "frontend");

function createApp() {
  const app = express();
  app.set("trust proxy", 1); // Hostinger / any reverse proxy in front of Node
  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(cookieParser());

  // Webhook must see the raw body for signature verification, so mount before express.json.
  app.use("/api/payments/webhook", require("./routes/checkout").webhook);

  app.use(express.json({ limit: "300kb" }));
  app.use(csrf);
  app.use(loadSessions);

  app.get("/health", async (req, res) => {
    try { await q("SELECT 1"); res.json({ ok: true, db: true }); } catch { res.status(503).json({ ok: false, db: false }); }
  });

  // ---------- API ----------
  app.use("/api", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  app.use("/api", require("./routes/public"));
  app.use("/api/auth", require("./routes/auth").router);
  app.use("/api/cart", require("./routes/cart"));
  app.use("/api/account", require("./routes/account"));
  app.use("/api/checkout", require("./routes/checkout").router);
  app.use("/api/admin", require("./routes/admin"));
  app.use("/api", (req, res, next) => next(new HttpError(404, "API route not found")));

  // ---------- SEO helpers ----------
  app.get("/robots.txt", (req, res) => {
    res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /account\nDisallow: /checkout\nDisallow: /cart\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
  });
  app.get("/sitemap.xml", async (req, res, next) => {
    try {
      const products = await q("SELECT slug, updated_at FROM products WHERE status IN ('upcoming','coming_soon','active','out_of_stock')");
      const cats = await q("SELECT slug FROM categories WHERE is_active=1");
      const urls = [["/", "1.0"], ["/products", "0.9"], ["/about", "0.5"], ["/faq", "0.5"], ["/contact", "0.5"],
        ["/policies/privacy", "0.2"], ["/policies/terms", "0.2"], ["/policies/shipping", "0.3"], ["/policies/refund", "0.3"]]
        .map(([u, p]) => `<url><loc>${config.siteUrl}${u}</loc><priority>${p}</priority></url>`)
        .concat(cats.map((c) => `<url><loc>${config.siteUrl}/products?category=${encodeURIComponent(c.slug)}</loc><priority>0.6</priority></url>`))
        .concat(products.map((p) => `<url><loc>${config.siteUrl}/products/${encodeURIComponent(p.slug)}</loc><lastmod>${new Date(p.updated_at).toISOString().slice(0, 10)}</lastmod><priority>0.8</priority></url>`));
      res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`);
    } catch (e) { next(e); }
  });

  // ---------- pages ----------
  const cache = new Map();
  const readPage = (file) => {
    if (config.isProd && cache.has(file)) return cache.get(file);
    const html = fs.readFileSync(path.join(FRONTEND, file), "utf8");
    cache.set(file, html);
    return html;
  };
  const escAttr = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  /** Server-side <title>/meta so search engines and link previews get real content. */
  const sendPage = (file, metaFn) => async (req, res, next) => {
    try {
      let html = readPage(file);
      const s = await getSettings().catch(() => ({}));
      const m = metaFn ? await metaFn(req, s) : null;
      if (m === false) { res.status(404); html = readPage("404.html"); }
      else if (m) {
        if (m.title) html = html.replace(/<title>[^<]*<\/title>/, `<title>${escAttr(m.title)}</title>`).replace(/(<meta property="og:title" content=")[^"]*/, `$1${escAttr(m.title)}`);
        if (m.description) html = html.replace(/(<meta name="description" content=")[^"]*/, `$1${escAttr(m.description)}`).replace(/(<meta property="og:description" content=")[^"]*/, `$1${escAttr(m.description)}`);
        if (m.image) html = html.replace(/(<meta property="og:image" content=")[^"]*/, `$1${escAttr(m.image)}`);
      }
      html = html.replace(/(<link rel="canonical" href=")[^"]*/, `$1${config.siteUrl}${req.path === "/" ? "/" : req.path.replace(/\/$/, "")}`);
      res.set("Cache-Control", "no-cache").type("html").send(html);
    } catch (e) { next(e); }
  };

  const absImg = (u) => (!u ? `${config.siteUrl}/img/products/pre-workout-front.jpg` : /^https?:/.test(u) ? u : config.siteUrl + u);
  app.get("/", sendPage("index.html", (req, s) => ({ title: s.seoTitle, description: s.seoDescription })));
  app.get("/products", sendPage("products.html"));
  app.get("/products/:slug", sendPage("product.html", async (req) => {
    const p = await one(`SELECT p.name, p.short_description, p.meta_title, p.meta_description,
      (SELECT url FROM images i WHERE i.owner_type='product' AND i.owner_id=p.id ORDER BY sort_order, id LIMIT 1) image
      FROM products p WHERE p.slug=? AND p.status <> 'draft'`, [req.params.slug]);
    if (!p) return false;
    return { title: p.meta_title || `${p.name} | HYPEMAX Nutrition`, description: p.meta_description || p.short_description, image: absImg(p.image) };
  }));
  app.get("/product.html", (req, res) => res.redirect(301, req.query.p ? `/products/${encodeURIComponent(req.query.p)}` : "/products"));
  for (const [route, file] of [["/about", "about.html"], ["/faq", "faq.html"], ["/contact", "contact.html"], ["/cart", "cart.html"], ["/checkout", "checkout.html"],
    ["/login", "login.html"], ["/register", "login.html"], ["/forgot-password", "login.html"]]) {
    app.get(route, sendPage(file));
    app.get(`/${file}`, (req, res) => res.redirect(301, route)); // old .html URLs
  }
  app.get(["/policies", "/policies/:slug"], sendPage("policies.html"));
  app.get(["/account", "/account/*"], sendPage("account.html"));
  app.get(["/admin", "/admin/*", "/admin.html"], (req, res, next) => { res.set("X-Robots-Tag", "noindex"); next(); }, sendPage("admin.html"));
  app.get("/index.html", (req, res) => res.redirect(301, "/"));

  app.use(express.static(FRONTEND, { index: false, maxAge: config.isProd ? "7d" : 0, setHeaders: (res, p) => { if (/\.html$/.test(p)) res.set("Cache-Control", "no-cache"); } }));
  app.use((req, res) => res.status(404).type("html").send(readPage("404.html")));

  // ---------- errors ----------
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = err.status || err.statusCode || 500, message = err.message, code = err.code;
    if (err.type === "entity.parse.failed") { status = 400; message = "Invalid JSON"; }
    else if (err.type === "entity.too.large") { status = 413; message = "Request too large"; }
    else if (err.code === "ER_DUP_ENTRY") { status = 409; message = "That value already exists"; }
    else if (status >= 500 && !(err instanceof HttpError)) {
      // Log enough to debug, but never request bodies, query values or SQL text (mysql2 errors embed the
      // full statement with parameters, which can include emails, hashes or tokens).
      const where = (err.stack || "").split("\n").slice(1, 4).map((s) => s.trim()).join(" | ");
      console.error(`${new Date().toISOString()} ${req.method} ${req.path} -> ${err.code || err.name}: ${err.sqlMessage ? "database error" : err.message} @ ${where}`);
      message = "Something went wrong on our side. Please try again.";
      code = "SERVER_ERROR";
    }
    if (req.path.startsWith("/api/") || req.xhr) return res.status(status).json({ error: message, code });
    res.status(status).type("text/plain").send(message);
  });

  return app;
}

module.exports = { createApp };
