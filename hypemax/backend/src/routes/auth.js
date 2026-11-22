const router = require("express").Router();
const config = require("../config");
const { q, one } = require("../db");
const { wrap, bad, str, email, password, phone, randomToken, sha256, safeEqual, HttpError } = require("../util");
const { rateLimit, checkLoginAllowed, recordLogin } = require("../security");
const { hashPassword, checkPassword, createSession, destroySession, destroyAllSessions, COOKIE } = require("../auth");
const { mergeGuestCart } = require("../services/cart");
const mail = require("../services/mail");

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone || null, email_verified: !!u.email_verified_at, has_password: !!(u.has_password ?? u.password_hash), google_linked: !!u.google_sub });

async function sendVerification(user) {
  const token = randomToken(32);
  await q("INSERT INTO user_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, 'verify', ?, UTC_TIMESTAMP() + INTERVAL 48 HOUR)", [user.id, sha256(token)]);
  return mail.sendTemplate(user.email, "verifyEmail", user, `${config.siteUrl}/account/verify?token=${token}`);
}
const sendWelcome = (u) => mail.sendTemplate(u.email, "welcome", u).catch(() => false);

async function startSession(req, res, user) {
  await createSession(res, req, "user", user.id);
  await mergeGuestCart(req, res, user.id);
}

router.post("/register", rateLimit({ windowMs: 3600e3, max: 10, message: "Too many sign-ups from your network. Try again later." }), wrap(async (req, res) => {
  const b = req.body || {};
  const name = str(b.name, { max: 120, name: "Name", required: true, min: 2 });
  const em = email(b.email);
  const pw = password(b.password);
  const ph = phone(b.phone, { required: false }) || null;
  if (await one("SELECT id FROM users WHERE email=?", [em])) throw new HttpError(409, "An account with this email already exists. Log in instead.", "EMAIL_TAKEN");
  const r = await q("INSERT INTO users (name, email, phone, password_hash) VALUES (?,?,?,?)", [name, em, ph, await hashPassword(pw)]);
  const user = { id: r.insertId, name, email: em, phone: ph, password_hash: true };
  const emailSent = await sendVerification(user);
  sendWelcome(user);
  if (config.requireEmailVerification && config.features.email) {
    return res.status(201).json({ ok: true, verification_required: true, message: "Check your inbox to verify your email, then log in." });
  }
  await startSession(req, res, user);
  res.status(201).json({ ok: true, user: publicUser(user), verification_email_sent: emailSent });
}));

router.post("/login", rateLimit({ windowMs: 15 * 60e3, max: 20, message: "Too many login attempts. Try again in 15 minutes." }), wrap(async (req, res) => {
  const b = req.body || {};
  const em = email(b.email);
  const pw = str(b.password, { max: 128, name: "Password", required: true, trim: false });
  const u = await one("SELECT * FROM users WHERE email=?", [em]);
  await checkLoginAllowed("user", req.ip, u);
  const ok = u && u.is_active && (await checkPassword(pw, u.password_hash));
  await recordLogin("user", "users", req.ip, em, u, !!ok);
  if (!ok) {
    if (u && !u.password_hash && u.google_sub) throw new HttpError(401, "This account uses Google sign-in. Continue with Google, or reset your password to add one.", "USE_GOOGLE");
    throw new HttpError(401, "Incorrect email or password", "BAD_CREDENTIALS");
  }
  if (config.requireEmailVerification && config.features.email && !u.email_verified_at)
    throw new HttpError(403, "Please verify your email first. We've sent you a new link.", "EMAIL_UNVERIFIED");
  await startSession(req, res, u);
  res.json({ ok: true, user: publicUser(u) });
}));

/**
 * Google sign-in. Two entry points share one linking routine:
 *  - Redirect flow (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET): /api/auth/google/start -> Google -> /api/auth/google/callback.
 *    Uses a one-time state value + PKCE stored in an httpOnly cookie and a server-side code exchange.
 *  - Popup flow (GOOGLE_CLIENT_ID only): Google Identity Services gives the browser an ID token, POSTed to /api/auth/google.
 * In both cases the ID token signature, audience, issuer and expiry are verified on the server; nothing the browser
 * says about the user is trusted.
 */
let googleClient = null;
const gClient = () => (googleClient ||= new (require("google-auth-library").OAuth2Client)(config.google.clientId, config.google.clientSecret || undefined, config.google.callbackUrl));
const GSTATE = "hm_gstate";

async function verifyGoogleIdToken(idToken) {
  let payload;
  try {
    payload = (await gClient().verifyIdToken({ idToken, audience: config.google.clientId })).getPayload();
  } catch { throw new HttpError(401, "Google sign-in could not be verified. Please try again.", "GOOGLE_INVALID"); }
  if (!payload || !payload.sub || !payload.email) throw new HttpError(401, "Google account has no email", "GOOGLE_INVALID");
  if (!payload.email_verified) throw new HttpError(401, "Your Google email is not verified", "GOOGLE_UNVERIFIED");
  return payload;
}

/** Find or create the customer for a verified Google identity, then start a session. */
async function signInWithGoogle(req, res, payload) {
  const em = payload.email.toLowerCase();
  let u = await one("SELECT * FROM users WHERE google_sub=?", [payload.sub]);
  if (!u) {
    u = await one("SELECT * FROM users WHERE email=?", [em]);
    if (u) {
      if (u.google_sub && u.google_sub !== payload.sub) throw new HttpError(409, "This email is linked to a different Google account", "GOOGLE_CONFLICT");
      if (!u.email_verified_at) {
        // Nobody ever proved they own this email. Google just did, so drop any password set by whoever
        // registered it (prevents pre-registration account takeover) and end their sessions.
        await q("UPDATE users SET google_sub=?, email_verified_at=UTC_TIMESTAMP(), password_hash=NULL WHERE id=?", [payload.sub, u.id]);
        await destroyAllSessions("user", u.id);
      } else {
        await q("UPDATE users SET google_sub=? WHERE id=?", [payload.sub, u.id]);
      }
      u = await one("SELECT * FROM users WHERE id=?", [u.id]);
    } else {
      const r = await q("INSERT INTO users (name, email, google_sub, email_verified_at) VALUES (?,?,?, UTC_TIMESTAMP())",
        [String(payload.name || em.split("@")[0]).slice(0, 120), em, payload.sub]);
      u = await one("SELECT * FROM users WHERE id=?", [r.insertId]);
      sendWelcome(u);
    }
  }
  if (!u.is_active) throw new HttpError(403, "This account has been disabled", "DISABLED");
  await recordLogin("user", "users", req.ip, em, u, true);
  await startSession(req, res, u);
  return u;
}

router.post("/google", rateLimit({ windowMs: 15 * 60e3, max: 30 }), wrap(async (req, res) => {
  if (!config.features.google) throw new HttpError(503, "Google sign-in is not configured yet", "GOOGLE_MISSING");
  const credential = str(req.body && req.body.credential, { max: 4096, name: "Credential", required: true });
  const u = await signInWithGoogle(req, res, await verifyGoogleIdToken(credential));
  res.json({ ok: true, user: publicUser(u) });
}));

const safeNext = (n) => (typeof n === "string" && /^\/(?![/\\])[^\r\n]*$/.test(n) && n.length < 300 ? n : "/account");

router.get("/google/start", rateLimit({ windowMs: 15 * 60e3, max: 30 }), wrap(async (req, res) => {
  if (!config.features.googleRedirect) return res.redirect("/login?google_error=" + encodeURIComponent("Google sign-in is not configured yet"));
  const state = randomToken(24);
  const { codeVerifier, codeChallenge } = await gClient().generateCodeVerifierAsync();
  res.cookie(GSTATE, JSON.stringify({ s: state, v: codeVerifier, n: safeNext(req.query.next) }),
    { httpOnly: true, secure: config.cookieSecure, sameSite: "lax", path: "/api/auth/google", maxAge: 10 * 60e3 });
  res.redirect(gClient().generateAuthUrl({
    scope: ["openid", "email", "profile"], state, code_challenge: codeChallenge, code_challenge_method: "S256",
    prompt: "select_account", redirect_uri: config.google.callbackUrl,
  }));
}));

router.get("/google/callback", wrap(async (req, res) => {
  const fail = (msg) => res.redirect("/login?google_error=" + encodeURIComponent(msg));
  let saved = null;
  try { saved = JSON.parse(req.cookies[GSTATE] || "null"); } catch {}
  res.clearCookie(GSTATE, { path: "/api/auth/google" });
  if (req.query.error) return fail(req.query.error === "access_denied" ? "Google sign-in was cancelled" : "Google sign-in failed");
  if (!config.features.googleRedirect) return fail("Google sign-in is not configured yet");
  if (!saved || !saved.s || !req.query.state || !safeEqual(String(req.query.state), saved.s) || !req.query.code)
    return fail("Your Google sign-in session expired. Please try again.");
  try {
    const { tokens } = await gClient().getToken({ code: String(req.query.code), codeVerifier: saved.v, redirect_uri: config.google.callbackUrl });
    if (!tokens.id_token) return fail("Google did not return an identity token");
    await signInWithGoogle(req, res, await verifyGoogleIdToken(tokens.id_token));
    res.redirect(safeNext(saved.n));
  } catch (e) {
    fail(e instanceof HttpError ? e.message : "Google sign-in failed. Please try again.");
  }
}));

router.post("/logout", wrap(async (req, res) => {
  await destroySession(req, res, "user");
  res.json({ ok: true });
}));

router.get("/me", wrap(async (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
}));

router.post("/forgot-password", rateLimit({ windowMs: 3600e3, max: 5 }), wrap(async (req, res) => {
  const em = email(req.body && req.body.email);
  const u = await one("SELECT id, name, email FROM users WHERE email=? AND is_active=1", [em]);
  if (u) {
    const token = randomToken(32);
    await q("UPDATE user_tokens SET used_at=UTC_TIMESTAMP() WHERE user_id=? AND purpose='reset' AND used_at IS NULL", [u.id]);
    await q("INSERT INTO user_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, 'reset', ?, UTC_TIMESTAMP() + INTERVAL 1 HOUR)", [u.id, sha256(token)]);
    await mail.sendTemplate(u.email, "passwordReset", u, `${config.siteUrl}/account/reset-password?token=${token}`);
  }
  // Same response either way so attackers can't discover which emails are registered.
  res.json({ ok: true, email_enabled: config.features.email, message: "If an account exists for that email, a reset link is on its way." });
}));

router.post("/reset-password", rateLimit({ windowMs: 3600e3, max: 10 }), wrap(async (req, res) => {
  const token = str(req.body && req.body.token, { max: 128, name: "Token", required: true });
  const pw = password(req.body && req.body.password);
  const t = await one("SELECT * FROM user_tokens WHERE token_hash=? AND purpose='reset' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()", [sha256(token)]);
  if (!t) throw bad("This reset link is invalid or has expired. Request a new one.");
  await q("UPDATE users SET password_hash=?, failed_logins=0, locked_until=NULL, email_verified_at=COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE id=?", [await hashPassword(pw), t.user_id]);
  await q("UPDATE user_tokens SET used_at=UTC_TIMESTAMP() WHERE id=?", [t.id]);
  await destroyAllSessions("user", t.user_id);
  one("SELECT name, email FROM users WHERE id=?", [t.user_id]).then((u) => u && mail.sendTemplate(u.email, "passwordChanged", u)).catch(() => {});
  res.json({ ok: true });
}));

router.post("/verify-email", rateLimit({ windowMs: 3600e3, max: 20 }), wrap(async (req, res) => {
  const token = str(req.body && req.body.token, { max: 128, name: "Token", required: true });
  const t = await one("SELECT * FROM user_tokens WHERE token_hash=? AND purpose='verify' AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()", [sha256(token)]);
  if (!t) throw bad("This verification link is invalid or has expired");
  await q("UPDATE users SET email_verified_at=COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE id=?", [t.user_id]);
  await q("UPDATE user_tokens SET used_at=UTC_TIMESTAMP() WHERE id=?", [t.id]);
  res.json({ ok: true });
}));

router.post("/resend-verification", rateLimit({ windowMs: 3600e3, max: 3 }), wrap(async (req, res) => {
  if (!req.user) throw new HttpError(401, "Please log in", "AUTH_REQUIRED");
  if (req.user.email_verified_at) return res.json({ ok: true, already: true });
  res.json({ ok: true, sent: await sendVerification(req.user) });
}));

module.exports = { router, publicUser, _setGoogleClient: (c) => { googleClient = c; } };
