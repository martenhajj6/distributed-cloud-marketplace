
const express = require("express");
const crypto = require("crypto");
const db = require("../dbconn");
const { HttpError, sendError, money, positiveInteger, logAudit } = require("../utils/util");
const { withTransaction } = require("../utils/tx");
const finance = require("../services/financeService");

const router = express.Router();
const commissionRate = Number(process.env.PLATFORM_COMMISSION_RATE ?? 15);

const handle = (fn, message) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY")
            return res.status(409).json({ error: "Record already exists." });

        sendError(res, error, message);
    }
};

const invalid = (res, message) => res.status(400).json({ error: message });

function filterId(req, res, name) {
    const id = req.query[name] === undefined ? null : positiveInteger(req.query[name]);

    if (req.query[name] !== undefined && !id) {
        invalid(res, `${name} must be a positive integer.`);
        return false;
    }

    return id;
}

// Payments
router.post("/payments", handle(async (req, res) => {
    const invoiceId = positiveInteger(req.body.invoice_id);
    const allocations = req.body.provider_allocations;
    const supplied = allocations != null;

    if (!invoiceId || (supplied && (!Array.isArray(allocations) || !allocations.length)))
        return invalid(res, "Invalid invoice ID or allocations.");

    if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100)
        return res.status(500).json({ error: "Invalid commission rate." });

    let providers = [];

    if (supplied) {
        for (const item of allocations) {
            const id = positiveInteger(item.provider_id);
            const amount = Number(item.gross_amount);

            if (!id || !Number.isFinite(amount) || amount <= 0)
                return invalid(res, "Invalid provider ID or amount.");

            if (providers.some(p => p.provider_id === id))
                return invalid(res, "Duplicate provider ID.");

            providers.push({ provider_id: id, gross_amount: money(amount) });
        }
    }

    const payment = await withTransaction(async connection => {
        const [rows] = await connection.execute(`
            SELECT i.id, i.total, i.status, bp.customer_id
            FROM invoices i
            JOIN billing_periods bp ON bp.id = i.billing_period_id
            WHERE i.id = ? FOR UPDATE
        `, [invoiceId]);

        if (!rows.length)
            throw new HttpError(404, { error: "Invoice not found." });

        const invoice = rows[0];

        if (invoice.status !== "Unpaid")
            throw new HttpError(409, {
                error: "Only unpaid invoices can be paid.",
                invoice_status: invoice.status
            });

        if (!supplied) {
            providers = await finance.deriveAllocations(connection, invoiceId, invoice.total);

            if (!providers?.length)
                throw new HttpError(400, { error: "Provider allocations required." });
        }

        const total = money(providers.reduce((sum, p) => sum + p.gross_amount, 0));

        if (total !== money(invoice.total))
            throw new HttpError(400, {
                error: "Allocations must equal invoice total.",
                invoice_total: money(invoice.total),
                allocation_total: total
            });

        const reference = `PAY-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

        const [result] = await connection.execute(`
            INSERT INTO payments (payment_reference, invoice_id, amount, status, simulated)
            VALUES (?, ?, ?, 'Succeeded', 1)
        `, [reference, invoiceId, total]);

        const earnings = [];

        for (const p of providers) {
            const commission = money(p.gross_amount * commissionRate / 100);
            const net = money(p.gross_amount - commission);

            await connection.execute(`
                INSERT INTO provider_earnings
                (payment_id, provider_id, gross_amount, commission_rate, commission_amount, net_amount)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [result.insertId, p.provider_id, p.gross_amount, commissionRate, commission, net]);

            earnings.push({
                ...p,
                commission_rate: commissionRate,
                commission_amount: commission,
                net_amount: net
            });
        }

        await connection.execute(
            "UPDATE invoices SET status = 'Paid' WHERE id = ?",
            [invoiceId]
        );

        const notify = (type, id, title, message) => connection.execute(`
            INSERT INTO payment_notifications
            (recipient_type, recipient_id, notification_type, title, message, payment_id)
            VALUES (?, ?, 'PaymentSucceeded', ?, ?, ?)
        `, [type, id, title, message, result.insertId]);

        await notify("Customer", invoice.customer_id, "Payment successful",
            `Payment ${reference} succeeded for $${total.toFixed(2)}.`);

        for (const p of earnings)
            await notify("Provider", p.provider_id, "Earnings recorded",
                `Payment ${reference} recorded. Your net earnings are $${p.net_amount.toFixed(2)}.`);

        return {
            message: "Simulated payment successful; no real money was charged.",
            payment_id: result.insertId,
            payment_reference: reference,
            invoice_id: invoiceId,
            amount: total,
            currency: "USD",
            status: "Succeeded",
            platform_commission_rate: commissionRate,
            provider_earnings: earnings
        };
    });

    res.status(201).json(payment);
}, "Could not simulate payment."));

router.get("/payments", handle(async (req, res) => {
    const id = filterId(req, res, "invoice_id");
    if (id === false) return;

    res.json(await finance.listPayments({ invoiceId: id }));
}, "Could not load payments."));

// Refunds
router.post("/refunds", handle(async (req, res) => {
    const paymentId = positiveInteger(req.body.payment_id);
    const amount = Number(req.body.amount);
    const reason = req.body.reason === undefined
        ? null : String(req.body.reason).trim().slice(0, 255);

    if (!paymentId || !Number.isFinite(amount) || amount <= 0)
        return invalid(res, "Invalid payment ID or refund amount.");

    const refund = await withTransaction(async connection => {
        const created = await finance.applyRefund(connection, { paymentId, amount, reason });

        await logAudit(connection, req.user, "REFUND_RECORDED_BY_ADMIN", "refund",
            created.refund_id, { payment_id: paymentId, amount: created.amount, reason });

        return created;
    });

    res.status(201).json({
        message: "Simulated refund recorded; no real money was transferred.",
        ...refund
    });
}, "Could not record refund."));

router.get("/refunds", handle(async (req, res) => {
    const id = filterId(req, res, "payment_id");
    if (id === false) return;

    res.json(await finance.listRefunds({ paymentId: id }));
}, "Could not load refunds."));

// Earnings
router.get("/earnings", handle(async (req, res) => {
    const id = filterId(req, res, "provider_id");
    if (id === false) return;

    res.json(await finance.getEarnings(id));
}, "Could not load earnings."));

// Withdrawals
router.get("/withdrawals", handle(async (req, res) => {
    const id = filterId(req, res, "provider_id");
    if (id === false) return;

    res.json(await finance.listWithdrawals(id));
}, "Could not load withdrawals."));

router.post("/withdrawals", handle(async (req, res) => {
    const providerId = positiveInteger(req.body.provider_id);
    const amount = money(req.body.amount);
    const note = req.body.note === undefined
        ? null : String(req.body.note).trim().slice(0, 255);

    if (!providerId || !Number.isFinite(Number(req.body.amount)) || amount <= 0)
        return invalid(res, "Invalid provider ID or amount.");

    res.status(201).json(await finance.createWithdrawal({ providerId, amount, note }));
}, "Could not create withdrawal."));

router.patch("/withdrawals/:id", handle(async (req, res) => {
    const id = positiveInteger(req.params.id);
    const { status } = req.body;

    if (!id || !["Approved", "Rejected", "Paid"].includes(status))
        return invalid(res, "Invalid withdrawal ID or status.");

    const result = await withTransaction(async connection => {
        const [rows] = await connection.execute(
            "SELECT id, provider_id, amount, status FROM withdrawal_requests WHERE id = ? FOR UPDATE",
            [id]
        );

        if (!rows.length)
            throw new HttpError(404, { error: "Withdrawal not found." });

        const old = rows[0].status;
        const allowed = (old === "Requested" && ["Approved", "Rejected"].includes(status)) ||
            (old === "Approved" && ["Paid", "Rejected"].includes(status));

        if (!allowed)
            throw new HttpError(409, { error: `Cannot change ${old} to ${status}.` });

        await connection.execute(
            "UPDATE withdrawal_requests SET status = ? WHERE id = ?",
            [status, id]
        );

        await logAudit(connection, req.user, `WITHDRAWAL_${status.toUpperCase()}`, "withdrawal", id, {
            provider_id: rows[0].provider_id,
            amount: money(rows[0].amount),
            previous_status: old
        });

        return {
            message: "Withdrawal status updated (simulated).",
            withdrawal_id: id,
            previous_status: old,
            status
        };
    });

    res.json(result);
}, "Could not update withdrawal."));

// Discount codes
router.post("/discount-codes", handle(async (req, res) => {
    const code = typeof req.body.code === "string"
        ? req.body.code.trim().toUpperCase() : "";

    const type = req.body.discount_type;
    const value = money(req.body.discount_value);
    const maxUses = req.body.max_uses == null || req.body.max_uses === ""
        ? null : positiveInteger(req.body.max_uses);
    const expiresAt = req.body.expires_at || null;

    if (!/^[A-Z0-9_-]{3,40}$/.test(code) ||
        !["Percentage", "Fixed"].includes(type) ||
        !Number.isFinite(Number(req.body.discount_value)) || value <= 0 ||
        (type === "Percentage" && value > 100) ||
        (req.body.max_uses != null && req.body.max_uses !== "" && !maxUses) ||
        (expiresAt && Number.isNaN(Date.parse(expiresAt))))
        return invalid(res, "Invalid discount details.");

    const id = await withTransaction(async connection => {
        const [result] = await connection.execute(`
            INSERT INTO discount_codes
            (code, discount_type, discount_value, max_uses, expires_at, active)
            VALUES (?, ?, ?, ?, ?, 1)
        `, [code, type, value, maxUses, expiresAt]);

        await logAudit(connection, req.user, "DISCOUNT_CODE_CREATED", "discount_code",
            result.insertId, {
                code,
                discount_type: type,
                discount_value: value,
                max_uses: maxUses,
                expires_at: expiresAt
            });

        return result.insertId;
    });

    res.status(201).json({
        message: "Discount code created.",
        id,
        code,
        discount_type: type,
        discount_value: value,
        max_uses: maxUses,
        expires_at: expiresAt,
        active: true
    });
}, "Could not create discount code."));

router.get("/discount-codes", handle(async (req, res) => {
    const [rows] = await db.execute(`
        SELECT id, code, discount_type, discount_value, max_uses,
               used_count, expires_at, active, created_at
        FROM discount_codes ORDER BY id DESC
    `);

    res.json(rows);
}, "Could not load discount codes."));

router.patch("/discount-codes/:id", handle(async (req, res) => {
    const id = positiveInteger(req.params.id);
    const { active } = req.body;

    if (!id || typeof active !== "boolean")
        return invalid(res, "Invalid discount ID or active value.");

    await withTransaction(async connection => {
        const [result] = await connection.execute(
            "UPDATE discount_codes SET active = ? WHERE id = ?",
            [active, id]
        );

        if (!result.affectedRows)
            throw new HttpError(404, { error: "Discount code not found." });

        await logAudit(connection, req.user,
            active ? "DISCOUNT_CODE_ACTIVATED" : "DISCOUNT_CODE_DEACTIVATED",
            "discount_code", id, {});
    });

    res.json({ message: "Discount code status updated.", id, active });
}, "Could not update discount code."));

// Notifications
router.get("/notifications", handle(async (req, res) => {
    const recipientType = req.query.recipient_type;
    const recipientId = positiveInteger(req.query.recipient_id);

    if (!["Customer", "Provider"].includes(recipientType) || !recipientId)
        return invalid(res, "Invalid recipient type or ID.");

    res.json(await finance.listNotifications({
        recipientType,
        recipientId,
        unreadOnly: req.query.unread_only === "true"
    }));
}, "Could not load notifications."));

router.patch("/notifications/:id/read", handle(async (req, res) => {
    const id = positiveInteger(req.params.id);
    if (!id) return invalid(res, "Invalid notification ID.");

    if (!(await finance.markNotificationRead(id)))
        return res.status(404).json({ error: "Notification not found." });

    res.json({ message: "Notification marked as read.", id, is_read: true });
}, "Could not update notification."));

// Dashboard
router.get("/dashboard", handle(async (req, res) => {
    res.json(await finance.getDashboard());
}, "Could not load dashboard."));

module.exports = router;
