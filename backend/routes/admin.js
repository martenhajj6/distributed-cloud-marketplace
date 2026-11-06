
const express = require("express");
const db = require("../dbconn");
const { sendError, positiveInteger, money, logAudit } = require("../utils/util");
const { requireRole } = require("../middleware/access");
const discounts = require("../services/discountService");
const finance = require("../services/financeService");

const router = express.Router();
const discountRouter = express.Router();
const fields = "id, code, discount_type, discount_value, max_uses, used_count, expires_at, active, created_at";

const handle = fn => async (req, res) => {
    try {
        await fn(req, res);
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY")
            return res.status(409).json({ error: "Discount code already exists." });

        sendError(res, error, "Request failed.");
    }
};

function validate(body, partial = false) {
    const v = {};

    if (!partial || body.code !== undefined) {
        v.code = discounts.normalizeCode(body.code);
        if (!/^[A-Z0-9_-]{1,40}$/.test(v.code || ""))
            return { error: "Invalid code." };
    }

    if (!partial || body.discount_type !== undefined) {
        v.discount_type = body.discount_type;
        if (!["Percentage", "Fixed"].includes(v.discount_type))
            return { error: "Invalid discount type." };
    }

    if (!partial || body.discount_value !== undefined) {
        v.discount_value = Number(body.discount_value);
        if (body.discount_value === "" || !Number.isFinite(v.discount_value) || v.discount_value <= 0)
            return { error: "Invalid discount value." };

        v.discount_value = money(v.discount_value);
    }

    if (!partial || body.max_uses !== undefined) {
        v.max_uses = body.max_uses == null || body.max_uses === ""
            ? null : Number(body.max_uses);

        if (v.max_uses !== null && (!Number.isInteger(v.max_uses) || v.max_uses < 1))
            return { error: "Invalid usage limit." };
    }

    if (!partial || body.expires_at !== undefined) {
        v.expires_at = body.expires_at || null;
        if (v.expires_at && Number.isNaN(Date.parse(v.expires_at)))
            return { error: "Invalid expiration date." };
    }

    if (body.active !== undefined) {
        if (![true, false, 0, 1].includes(body.active))
            return { error: "Invalid active value." };

        v.active = Number(Boolean(body.active));
    }

    if (!partial && v.discount_type === "Percentage" && v.discount_value > 100)
        return { error: "Percentage cannot exceed 100." };

    if (partial && !Object.keys(v).length)
        return { error: "Nothing to update." };

    return { values: v };
}

// Refund requests
router.get("/refunds", handle(async (req, res) => {
    const status = req.query.status ?? null;

    if (status && !["Pending", "Approved", "Rejected"].includes(status))
        return res.status(400).json({ error: "Invalid status." });

    res.json(await finance.listRefundRequests({ status }));
}));

// Approve or reject refund
router.patch("/refunds/:id", handle(async (req, res) => {
    const requestId = positiveInteger(req.params.id);
    const { status, admin_note } = req.body;

    if (!requestId || !["Approved", "Rejected"].includes(status))
        return res.status(400).json({ error: "Invalid ID or status." });

    res.json(await finance.decideRefundRequest({
        requestId,
        status,
        adminNote: admin_note == null ? null : String(admin_note).trim().slice(0, 255),
        admin: req.user,
        audit: logAudit
    }));
}));

// Dashboard
router.get("/dashboard", handle(async (req, res) => {
    const [totals, providers] = await Promise.all([
        finance.getDashboard(),
        finance.getEarnings()
    ]);

    res.json({ ...totals, providers });
}));

// Audit log
router.get("/audit-log", handle(async (req, res) => {
    const limit = Math.min(positiveInteger(req.query.limit) || 50, 200);
    const where = [];
    const params = [];

    if (req.query.entity_type !== undefined) {
        where.push("entity_type = ?");
        params.push(String(req.query.entity_type));
    }

    if (req.query.entity_id !== undefined) {
        const id = positiveInteger(req.query.entity_id);
        if (!id) return res.status(400).json({ error: "Invalid entity ID." });

        where.push("entity_id = ?");
        params.push(id);
    }

    const [rows] = await db.query(`
        SELECT * FROM financial_audit_log
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY id DESC LIMIT ${limit}
    `, params);

    res.json(rows.map(row => ({
        ...row,
        details: row.details ? JSON.parse(row.details) : null
    })));
}));

// List discounts
discountRouter.get("/", requireRole("Admin"), handle(async (req, res) => {
    const [rows] = await db.execute(`SELECT ${fields} FROM discount_codes ORDER BY id DESC`);
    res.json(rows);
}));

// Create discount
discountRouter.post("/", requireRole("Admin"), handle(async (req, res) => {
    const { values: v, error } = validate(req.body || {});
    if (error) return res.status(400).json({ error });

    const [result] = await db.execute(`
        INSERT INTO discount_codes
        (code, discount_type, discount_value, max_uses, expires_at, active)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [v.code, v.discount_type, v.discount_value, v.max_uses, v.expires_at, v.active ?? 1]);

    await logAudit(db, req.user, "discount_created", "discount_code", result.insertId, v);

    const [rows] = await db.execute(`SELECT ${fields} FROM discount_codes WHERE id = ?`, [result.insertId]);
    res.status(201).json(rows[0]);
}));

// Update discount
discountRouter.patch("/:id", requireRole("Admin"), handle(async (req, res) => {
    const id = positiveInteger(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid ID." });

    const { values: v, error } = validate(req.body || {}, true);
    if (error) return res.status(400).json({ error });

    const [rows] = await db.execute(`SELECT ${fields} FROM discount_codes WHERE id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ error: "Discount not found." });

    const type = v.discount_type ?? rows[0].discount_type;
    const value = v.discount_value ?? Number(rows[0].discount_value);

    if (type === "Percentage" && value > 100)
        return res.status(400).json({ error: "Percentage cannot exceed 100." });

    const keys = Object.keys(v);

    await db.execute(`
        UPDATE discount_codes SET ${keys.map(k => `${k} = ?`).join(", ")}
        WHERE id = ?
    `, [...keys.map(k => v[k]), id]);

    await logAudit(db, req.user, "discount_updated", "discount_code", id, {
        changed_fields: keys,
        before: { code: rows[0].code, active: rows[0].active },
        after: v
    });

    const [updated] = await db.execute(`SELECT ${fields} FROM discount_codes WHERE id = ?`, [id]);
    res.json(updated[0]);
}));

// Validate discount
discountRouter.post("/validate", handle(async (req, res) => {
    const code = discounts.normalizeCode(req.body?.code);
    const hasSubtotal = req.body?.subtotal != null;
    const subtotal = hasSubtotal ? Number(req.body.subtotal) : null;

    if (!code || code.length > 40 || (hasSubtotal && (
        req.body.subtotal === "" || !Number.isFinite(subtotal) || subtotal < 0
    ))) {
        return res.status(400).json({ error: "Invalid code or subtotal." });
    }

    const discount = await discounts.findByCode(db, code);
    const reason = discount ? discounts.unusableReason(discount) : "invalid";

    if (reason)
        return res.json({ valid: false, code, reason });

    const result = {
        valid: true,
        code: discount.code,
        discount_type: discount.discount_type,
        discount_value: Number(discount.discount_value),
        expires_at: discount.expires_at
    };

    if (hasSubtotal) {
        const amount = discounts.calculateDiscount(discount, money(subtotal));

        Object.assign(result, {
            subtotal: money(subtotal),
            discount_amount: amount,
            total: Math.max(0, money(subtotal - amount)),
            currency: "USD"
        });
    }

    res.json(result);
}));

router.discountsRouter = discountRouter;
module.exports = router;
