const { HttpError, money } = require("../utils/util");
const { withTransaction } = require("../utils/tx");
const { query, where, bad, makeRef } = require("../utils/helpers");
const { notify } = require("./notificationService");

const COMMISSION = Number(process.env.PLATFORM_COMMISSION_RATE ?? 15);

function listPayments({ invoiceId = null, customerId = null } = {}) {
    const w = where({ "p.invoice_id": invoiceId, "bp.customer_id": customerId });

    return query(`
        SELECT p.id, p.payment_reference, p.invoice_id, i.invoice_number,
               p.amount, p.status, p.simulated, p.created_at
        FROM payments p
        JOIN invoices i ON i.id = p.invoice_id
        JOIN billing_periods bp ON bp.id = i.billing_period_id
        ${w.sql}
        ORDER BY p.id DESC
    `, w.params);
}

// Split the invoice total across providers in proportion to their line items.
// Returns null when any line has no provider (allocations must be supplied).
async function deriveAllocations(connection, invoiceId, invoiceTotal) {
    const [rows] = await connection.execute(`
        SELECT provider_id, SUM(line_total) AS gross
        FROM invoice_items
        WHERE invoice_id = ?
        GROUP BY provider_id ORDER BY provider_id
    `, [invoiceId]);

    if (!rows.length || rows.some(row => row.provider_id == null)) return null;

    const subtotal = money(rows.reduce((sum, row) => sum + Number(row.gross), 0));
    const total = money(invoiceTotal);
    const allocations = rows.map(row => ({
        provider_id: row.provider_id,
        gross_amount: subtotal === 0 ? 0 : money(Number(row.gross) * total / subtotal)
    }));

    // Put any rounding difference on the largest share
    const difference = money(total - allocations.reduce((sum, a) => sum + a.gross_amount, 0));

    if (difference !== 0) {
        const largest = allocations.reduce((best, a) => a.gross_amount > best.gross_amount ? a : best);
        largest.gross_amount = money(largest.gross_amount + difference);
    }

    return allocations.filter(a => a.gross_amount > 0);
}

// allocations: optional [{ provider_id, gross_amount }]; derived from the invoice when omitted
async function createPayment({ invoiceId, allocations = null }) {
    if (!(COMMISSION >= 0 && COMMISSION <= 100))
        throw new HttpError(500, { error: "Invalid commission rate." });

    return withTransaction(async connection => {
        const [[invoice]] = await connection.execute(`
            SELECT i.id, i.total, i.status, bp.customer_id
            FROM invoices i
            JOIN billing_periods bp ON bp.id = i.billing_period_id
            WHERE i.id = ? FOR UPDATE
        `, [invoiceId]);

        if (!invoice) throw new HttpError(404, { error: "Invoice not found." });

        if (invoice.status !== "Unpaid")
            throw new HttpError(409, {
                error: "Only unpaid invoices can be paid.",
                invoice_status: invoice.status
            });

        const providers = allocations ?? await deriveAllocations(connection, invoiceId, invoice.total);
        if (!providers?.length) throw bad("Provider allocations required.");

        const total = money(providers.reduce((sum, p) => sum + p.gross_amount, 0));

        if (total !== money(invoice.total))
            throw bad("Allocations must equal invoice total.", {
                invoice_total: money(invoice.total),
                allocation_total: total
            });

        const reference = makeRef("PAY");

        const [{ insertId }] = await connection.execute(`
            INSERT INTO payments (payment_reference, invoice_id, amount, status, simulated)
            VALUES (?, ?, ?, 'Succeeded', 1)
        `, [reference, invoiceId, total]);

        const lines = [];

        for (const p of providers) {
            const commission = money(p.gross_amount * COMMISSION / 100);
            const net = money(p.gross_amount - commission);

            await connection.execute(`
                INSERT INTO provider_earnings
                (payment_id, provider_id, gross_amount, commission_rate, commission_amount, net_amount)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [insertId, p.provider_id, p.gross_amount, COMMISSION, commission, net]);

            lines.push({
                ...p,
                commission_rate: COMMISSION,
                commission_amount: commission,
                net_amount: net
            });
        }

        await connection.execute("UPDATE invoices SET status = 'Paid' WHERE id = ?", [invoiceId]);

        const tell = (to, id, title, message) =>
            notify(connection, { to, id, type: "PaymentSucceeded", title, message, paymentId: insertId });

        await tell("Customer", invoice.customer_id, "Payment successful",
            `Payment ${reference} succeeded for $${total.toFixed(2)}.`);

        for (const line of lines)
            await tell("Provider", line.provider_id, "Earnings recorded",
                `Payment ${reference} recorded. Your net earnings are $${line.net_amount.toFixed(2)}.`);

        return {
            message: "Simulated payment successful; no real money was charged.",
            payment_id: insertId,
            payment_reference: reference,
            invoice_id: invoiceId,
            amount: total,
            currency: "USD",
            status: "Succeeded",
            platform_commission_rate: COMMISSION,
            provider_earnings: lines
        };
    });
}

module.exports = { listPayments, deriveAllocations, createPayment };
