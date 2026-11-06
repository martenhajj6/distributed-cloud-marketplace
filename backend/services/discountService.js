
const { HttpError, money } = require("../utils/util");

// Normalize discount code
function normalizeCode(value) {
    const code = value == null ? "" : String(value).trim().toUpperCase();
    return code || null;
}

// Find discount
async function findByCode(db, code, { forUpdate = false } = {}) {
    const [rows] = await db.execute(`
        SELECT id, code, discount_type, discount_value,
               max_uses, used_count, expires_at, active
        FROM discount_codes
        WHERE code = ? ${forUpdate ? "FOR UPDATE" : ""}
    `, [code]);

    return rows[0] || null;
}

// Check discount availability
function unusableReason(discount) {
    if (!discount.active) return "inactive";

    if (discount.max_uses !== null && Number(discount.used_count) >= Number(discount.max_uses))
        return "limit_reached";

    if (discount.expires_at && new Date(discount.expires_at).getTime() < Date.now())
        return "expired";

    return null;
}

// Calculate discount
function calculateDiscount(discount, subtotal) {
    const value = Number(discount.discount_value);
    const amount = discount.discount_type === "Percentage"
        ? subtotal * value / 100
        : Math.min(subtotal, value);

    return money(amount);
}

// Load valid discount
async function loadUsableDiscount(db, code) {
    const discount = await findByCode(db, code, { forUpdate: true });

    if (!discount)
        throw new HttpError(400, { error: "Discount code is invalid." });

    if (unusableReason(discount))
        throw new HttpError(400, {
            error: "Discount code is inactive, expired, or has reached its usage limit."
        });

    return discount;
}

module.exports = {
    normalizeCode,
    findByCode,
    unusableReason,
    calculateDiscount,
    loadUsableDiscount
};
