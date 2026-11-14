const db = require("../../DAL/dbconn");
const { withTransaction } = db;
const repository = require("../../DAL/finance/discount");
const { money, prorateMoney, isDate } = require("../../utils/util");
const { MAX_MONEY } = require("../../utils/constants");
const { logAudit } = require("../../DAL/finance/audit");
const { bad, notFound, positiveAmount } = require("../../utils/helpers");

const CODE_RE = /^[A-Z0-9_-]{1,40}$/;
const TYPES = ["Percentage", "Fixed"];

// Store RFC3339 input as UTC in MySQL's timezone-free DATETIME column.
function expirationDate(value) {
    if (value == null) return null;
    if (typeof value !== "string") throw bad("Invalid expiration date.");
    const match = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/.exec(value);
    if (!match || !isDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59)
        throw bad("Expiration must be a valid RFC3339 date-time with a timezone.");
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) throw bad("Invalid expiration date.");
    const utc = new Date(timestamp).toISOString();
    if (utc.slice(0, 4) < "1000" || utc.slice(0, 4) > "9999" || utc.length !== 24)
        throw bad("Expiration is outside the supported date range.");
    return utc.slice(0, 19).replace("T", " ");
}

const normalizeCode = value =>
    typeof value === "string" ? value.trim().toUpperCase() || null : null;

const findByCode = repository.findByCode;

const byId = repository.byId;

function unusableReason(discount) {
    if (!discount.active) return "inactive";

    if (discount.max_uses !== null && Number(discount.used_count) >= Number(discount.max_uses))
        return "limit_reached";

    if (discount.expires_at && Date.parse(discount.expires_at.replace(" ", "T") + "Z") <= Date.now())
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
        ? prorateMoney(subtotal, value, 100)
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
        if (!v.discount_value || v.discount_value > 99999999.99) throw bad("Invalid discount value.");
    }

    if (has("max_uses")) {
        v.max_uses = body.max_uses ?? null;

        if (v.max_uses !== null && (!Number.isInteger(v.max_uses) || v.max_uses < 1 || v.max_uses > 2147483647))
            throw bad("Invalid usage limit.");
    }

    if (has("expires_at")) {
        v.expires_at = expirationDate(body.expires_at);
    }

    if (body.active !== undefined) {
        if (typeof body.active !== "boolean") throw bad("Invalid active value.");
        v.active = Number(Boolean(body.active));
    }

    if (partial && !Object.keys(v).length) throw bad("Nothing to update.");

    return v;
}

const checkPercentage = (type, value) => {
    if (type === "Percentage" && value > 100) throw bad("Percentage cannot exceed 100.");
};

const listDiscounts = repository.listDiscounts;

// createDiscount / updateDiscount: pass a transaction connection so the audit row is atomic
async function createDiscount(db, body, admin) {
    const v = validate(body);
    checkPercentage(v.discount_type, v.discount_value);

    const [result] = await repository.insertDiscount(db, [v.code, v.discount_type, v.discount_value, v.max_uses, v.expires_at, v.active ?? 1]);

    await logAudit(db, admin, "DISCOUNT_CODE_CREATED", "discount_code", result.insertId, v);

    return byId(db, result.insertId);
}

async function updateDiscount(db, id, body, admin) {
    const v = validate(body, true);
    const previous = await byId(db, id, true);

    if (!previous) throw notFound("Discount not found.");

    checkPercentage(v.discount_type ?? previous.discount_type,
        v.discount_value ?? Number(previous.discount_value));

    const keys = Object.keys(v);

    await repository.updateDiscount(db, id, v);

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
    const hasSubtotal = Object.hasOwn(body, "subtotal");
    const subtotal = hasSubtotal ? body.subtotal : null;

    if (!code || !CODE_RE.test(code) ||
        (hasSubtotal && (typeof subtotal !== "number" || !Number.isFinite(subtotal) || subtotal < 0 || subtotal > MAX_MONEY)))
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
    loadUsableDiscount,
    listDiscounts: () => listDiscounts(db),
    createDiscount: (body, admin) => withTransaction(c => createDiscount(c, body, admin)),
    updateDiscount: (id, body, admin) => withTransaction(c => updateDiscount(c, id, body, admin)),
    validateDiscount: body => validateDiscount(db, body)
};
