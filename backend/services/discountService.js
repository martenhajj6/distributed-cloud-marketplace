const { money, logAudit } = require("../utils/util");
const { bad, notFound, positiveAmount } = require("../utils/helpers");

const fields = "id, code, discount_type, discount_value, max_uses, used_count, expires_at, active, created_at";
const CODE_RE = /^[A-Z0-9_-]{1,40}$/;
const TYPES = ["Percentage", "Fixed"];
const blank = v => v == null || v === "";

const normalizeCode = value =>
    value == null ? null : String(value).trim().toUpperCase() || null;

async function findByCode(db, code, { forUpdate = false } = {}) {
    const [[discount]] = await db.execute(
        `SELECT ${fields} FROM discount_codes WHERE code = ? ${forUpdate ? "FOR UPDATE" : ""}`,
        [code]
    );

    return discount || null;
}

async function byId(db, id) {
    const [[discount]] = await db.execute(`SELECT ${fields} FROM discount_codes WHERE id = ?`, [id]);
    return discount || null;
}

function unusableReason(discount) {
    if (!discount.active) return "inactive";

    if (discount.max_uses !== null && Number(discount.used_count) >= Number(discount.max_uses))
        return "limit_reached";

    if (discount.expires_at && new Date(discount.expires_at).getTime() < Date.now())
        return "expired";

    return null;
}

// Look up a code without locking: { discount, reason } (reason null = usable)
async function checkDiscount(db, raw) {
    const code = normalizeCode(raw);
    const discount = code ? await findByCode(db, code) : null;

    return { discount, reason: discount ? unusableReason(discount) : "invalid" };
}

function calculateDiscount(discount, subtotal) {
    const value = Number(discount.discount_value);

    return money(discount.discount_type === "Percentage"
        ? subtotal * value / 100
        : Math.min(subtotal, value));
}

// Lock and return a usable discount, or throw (used while creating invoices)
async function loadUsableDiscount(db, code) {
    const discount = await findByCode(db, normalizeCode(code), { forUpdate: true });

    if (!discount) throw bad("Discount code is invalid.");

    if (unusableReason(discount))
        throw bad("Discount code is inactive, expired, or has reached its usage limit.");

    return discount;
}

function validate(body = {}, partial = false) {
    const v = {};
    const has = key => !partial || body[key] !== undefined;

    if (has("code")) {
        v.code = normalizeCode(body.code);
        if (!CODE_RE.test(v.code || "")) throw bad("Invalid code.");
    }

    if (has("discount_type")) {
        v.discount_type = body.discount_type;
        if (!TYPES.includes(v.discount_type)) throw bad("Invalid discount type.");
    }

    if (has("discount_value")) {
        v.discount_value = positiveAmount(body.discount_value);
        if (!v.discount_value) throw bad("Invalid discount value.");
    }

    if (has("max_uses")) {
        v.max_uses = blank(body.max_uses) ? null : Number(body.max_uses);

        if (v.max_uses !== null && (!Number.isInteger(v.max_uses) || v.max_uses < 1))
            throw bad("Invalid usage limit.");
    }

    if (has("expires_at")) {
        v.expires_at = body.expires_at || null;

        if (v.expires_at && Number.isNaN(Date.parse(v.expires_at)))
            throw bad("Invalid expiration date.");
    }

    if (body.active !== undefined) {
        if (![true, false, 0, 1].includes(body.active)) throw bad("Invalid active value.");
        v.active = Number(Boolean(body.active));
    }

    if (partial && !Object.keys(v).length) throw bad("Nothing to update.");

    return v;
}

const checkPercentage = (type, value) => {
    if (type === "Percentage" && value > 100) throw bad("Percentage cannot exceed 100.");
};

const listDiscounts = async db =>
    (await db.execute(`SELECT ${fields} FROM discount_codes ORDER BY id DESC`))[0];

// createDiscount / updateDiscount: pass a transaction connection so the audit row is atomic
async function createDiscount(db, body, admin) {
    const v = validate(body);
    checkPercentage(v.discount_type, v.discount_value);

    const [result] = await db.execute(`
        INSERT INTO discount_codes (code, discount_type, discount_value, max_uses, expires_at, active)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [v.code, v.discount_type, v.discount_value, v.max_uses, v.expires_at, v.active ?? 1]);

    await logAudit(db, admin, "DISCOUNT_CODE_CREATED", "discount_code", result.insertId, v);

    return byId(db, result.insertId);
}

async function updateDiscount(db, id, body, admin) {
    const v = validate(body, true);
    const previous = await byId(db, id);

    if (!previous) throw notFound("Discount not found.");

    checkPercentage(v.discount_type ?? previous.discount_type,
        v.discount_value ?? Number(previous.discount_value));

    const keys = Object.keys(v);

    await db.execute(
        `UPDATE discount_codes SET ${keys.map(k => `${k} = ?`).join(", ")} WHERE id = ?`,
        [...keys.map(k => v[k]), id]
    );

    await logAudit(db, admin, "DISCOUNT_CODE_UPDATED", "discount_code", id, {
        changed_fields: keys,
        before: { code: previous.code, active: previous.active },
        after: v
    });

    return byId(db, id);
}

// Public checkout validation: optional subtotal returns the discounted total
async function validateDiscount(db, body = {}) {
    const code = normalizeCode(body.code);
    const hasSubtotal = body.subtotal != null;
    const subtotal = hasSubtotal ? Number(body.subtotal) : null;

    if (!code || !CODE_RE.test(code) ||
        (hasSubtotal && (body.subtotal === "" || !Number.isFinite(subtotal) || subtotal < 0)))
        throw bad("Invalid code or subtotal.");

    const { discount, reason } = await checkDiscount(db, code);

    if (reason) return { valid: false, code, reason };

    const result = {
        valid: true,
        code: discount.code,
        discount_type: discount.discount_type,
        discount_value: Number(discount.discount_value),
        expires_at: discount.expires_at
    };

    if (hasSubtotal) {
        const sub = money(subtotal);
        const amount = calculateDiscount(discount, sub);

        Object.assign(result, {
            subtotal: sub,
            discount_amount: amount,
            total: Math.max(0, money(sub - amount)),
            currency: "USD"
        });
    }

    return result;
}

module.exports = {
    normalizeCode, findByCode, checkDiscount, unusableReason, calculateDiscount,
    loadUsableDiscount, listDiscounts, createDiscount, updateDiscount, validateDiscount
};
