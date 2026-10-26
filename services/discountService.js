const { HttpError } = require("./errors");
const { money } = require("./util");

function normalizeCode(value) {
  if (value === undefined || value === null) return null;
  const code = String(value).trim().toUpperCase();
  return code === "" ? null : code;
}

async function findByCode(executor, code, { forUpdate = false } = {}) {
  const [rows] = await executor.execute(
    `SELECT id, code, discount_type, discount_value, max_uses, used_count, expires_at, active
     FROM discount_codes WHERE code = ?${forUpdate ? " FOR UPDATE" : ""}`,
    [code]
  );
  return rows[0] || null;
}

// Returns null when the code can be used, otherwise "inactive", "limit_reached" or "expired".
function unusableReason(discount) {
  if (!discount.active) return "inactive";
  if (discount.max_uses !== null && Number(discount.used_count) >= Number(discount.max_uses)) return "limit_reached";
  if (discount.expires_at && new Date(discount.expires_at).getTime() < Date.now()) return "expired";
  return null;
}

// Same rules the invoice generator uses: fixed discounts never push the total below zero.
function calculateDiscount(discount, subtotal) {
  const amount = discount.discount_type === "Percentage"
    ? money(subtotal * Number(discount.discount_value) / 100)
    : Math.min(subtotal, Number(discount.discount_value));
  return money(amount);
}

// Used by invoice generation: throws the same 400 errors the original code returned.
async function loadUsableDiscount(connection, code) {
  const discount = await findByCode(connection, code, { forUpdate: true });
  if (!discount) throw new HttpError(400, { error: "Discount code is invalid." });
  if (unusableReason(discount)) {
    throw new HttpError(400, { error: "Discount code is inactive, expired, or has reached its usage limit." });
  }
  return discount;
}

module.exports = { normalizeCode, findByCode, unusableReason, calculateDiscount, loadUsableDiscount };
