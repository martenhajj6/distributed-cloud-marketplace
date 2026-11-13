const repository = require("../../DAL/payment");
const { HttpError, money, allocateAmounts } = require("../../utils/util");
const { withTransaction } = require("../../DAL/dbconn");
const { bad, makeRef } = require("../../utils/helpers");
const { notify } = require("./notificationService");

const COMMISSION = Number(process.env.PLATFORM_COMMISSION_RATE ?? 15);

const listPayments = repository.listPayments;

// Split the invoice total across providers in proportion to their line items.
// Returns null when any line has no provider (allocations must be supplied).
async function deriveAllocations(connection, invoiceId, invoiceTotal) {
    const [rows] = await repository.statement5(connection, [invoiceId]);

    if (!rows.length || rows.some(row => row.provider_id == null)) return null;

    const amounts = allocateAmounts(invoiceTotal, rows.map(row => Number(row.gross)));
    const allocations = rows.map((row, index) => ({
        provider_id: row.provider_id,
        gross_amount: amounts[index]
    }));

    return allocations.filter(a => a.gross_amount > 0);
}

// allocations: optional [{ provider_id, gross_amount }]; derived from the invoice when omitted
async function createPayment({ invoiceId, allocations = null, customerId = null }) {
    if (!(COMMISSION >= 0 && COMMISSION <= 100))
        throw new HttpError(500, { error: "Invalid commission rate." });

    return withTransaction(async connection => {
        const [[invoice]] = await repository.statement4(connection, [invoiceId]);

        if (!invoice || (customerId !== null && Number(invoice.customer_id) !== Number(customerId)))
            throw new HttpError(404, { error: "Invoice not found for your account." });

        if (invoice.status !== "Unpaid")
            throw new HttpError(409, {
                error: "Only unpaid invoices can be paid.",
                invoice_status: invoice.status
            });

        const providers = allocations ?? await deriveAllocations(connection, invoiceId, invoice.total);
        if (!providers?.length) throw bad("This invoice has no provider allocation. Please contact support; payment cannot be completed until its invoice items identify a provider.");

        const total = money(providers.reduce((sum, p) => sum + p.gross_amount, 0));

        if (total !== money(invoice.total))
            throw bad("Allocations must equal invoice total.", {
                invoice_total: money(invoice.total),
                allocation_total: total
            });

        const reference = makeRef("PAY");

        const [{ insertId }] = await repository.statement3(connection, [reference, invoiceId, total]);

        const lines = [];

        for (const p of providers) {
            const commission = money(p.gross_amount * COMMISSION / 100);
            const net = money(p.gross_amount - commission);

            await repository.statement2(connection, [insertId, p.provider_id, p.gross_amount, COMMISSION, commission, net]);

            lines.push({
                ...p,
                commission_rate: COMMISSION,
                commission_amount: commission,
                net_amount: net
            });
        }

        await repository.statement1(connection, [invoiceId]);

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
