const router = require("express").Router();
const { pool, q, one } = require("../db");
const { wrap, int, str, bad, notFound } = require("../util");
const { rateLimit } = require("../security");
const { getCartId, cartLines } = require("../services/cart");
const { priceLines, MAX_QTY } = require("../services/pricing");
const analytics = require("../services/analytics");

async function cartResponse(req, res, couponCode) {
  const cartId = await getCartId(req, res);
  const lines = await cartLines(cartId);
  const priced = await priceLines(pool, lines, { couponCode: couponCode || null, userId: req.user ? req.user.id : null, mode: "preview" });
  priced.count = lines.reduce((s, l) => s + l.quantity, 0);
  return priced;
}

// GET /api/cart?coupon=CODE  -> fully server-priced cart (coupon is only previewed here)
router.get("/", wrap(async (req, res) => {
  res.json(await cartResponse(req, res, req.query.coupon ? String(req.query.coupon) : null));
}));

const lineInput = (b) => ({
  product_id: int(b.product_id, { min: 1, name: "Product", required: true }),
  flavour: str(b.flavour, { max: 60, name: "Flavour" }),
});

router.post("/items", rateLimit({ windowMs: 60e3, max: 60 }), wrap(async (req, res) => {
  const b = req.body || {};
  const { product_id, flavour } = lineInput(b);
  const qty = int(b.quantity ?? 1, { min: 1, max: MAX_QTY, name: "Quantity" });
  const p = await one("SELECT id, status, flavours FROM products WHERE id=?", [product_id]);
  if (!p) throw notFound("Product not found");
  if (p.status !== "active") throw bad("This product is not available for purchase");
  const fl = Array.isArray(p.flavours) ? p.flavours : [];
  if (fl.length && !fl.includes(flavour)) throw bad("Please choose a flavour");
  const cartId = await getCartId(req, res, { create: true });
  await q(`INSERT INTO cart_items (cart_id, product_id, flavour, quantity) VALUES (?,?,?,?)
           ON DUPLICATE KEY UPDATE quantity = LEAST(?, quantity + VALUES(quantity))`, [cartId, product_id, flavour, qty, MAX_QTY]);
  await q("UPDATE carts SET updated_at=UTC_TIMESTAMP() WHERE id=?", [cartId]);
  analytics.track(req, res, "add_to_cart", { productId: product_id, value: qty });
  res.json(await cartResponse(req, res, b.coupon));
}));

router.patch("/items", wrap(async (req, res) => {
  const b = req.body || {};
  const { product_id, flavour } = lineInput(b);
  const qty = int(b.quantity, { min: 1, max: MAX_QTY, name: "Quantity", required: true });
  const cartId = await getCartId(req, res);
  if (cartId) await q("UPDATE cart_items SET quantity=? WHERE cart_id=? AND product_id=? AND flavour=?", [qty, cartId, product_id, flavour]);
  res.json(await cartResponse(req, res, b.coupon));
}));

router.delete("/items", wrap(async (req, res) => {
  const b = req.body || {};
  const { product_id, flavour } = lineInput(b);
  const cartId = await getCartId(req, res);
  if (cartId) {
    const r = await q("DELETE FROM cart_items WHERE cart_id=? AND product_id=? AND flavour=?", [cartId, product_id, flavour]);
    if (r.affectedRows) analytics.track(req, res, "remove_from_cart", { productId: product_id });
  }
  res.json(await cartResponse(req, res, b.coupon));
}));

module.exports = router;
