const repository = require("../../DAL/finance/refund");
const { HttpError, money, prorateMoney, allocateAmounts } = require("../../utils/util");
const { logAudit } = require("../../DAL/finance/audit");
const { withTransaction } = require("../../DAL/dbconn");
const { bad, makeRef, positiveAmount, withCurrency } = require("../../utils/helpers");
const { notify, notifyAdmins } = require("./notificationService");
const { providerBalance } = require("./providerFinanceService");
const { financialTransaction } = require("./financialTransaction");
const { lockProviders } = require("../../DAL/finance/locks");

async function refundedTotal(connection, paymentId) {
    const [[row]] = await repository.refundedTotal(connection, [paymentId]);

    return money(row.total);
}

// Lock a successful payment row (optionally only if it belongs to the customer)
async function lockPayment(connection, paymentId, customerId = null) {
    const payment = await repository.findPayment(connection, paymentId, customerId);

    if (!payment) throw new HttpError(404, { error: "Payment not found." });
    if (payment.status !== "Succeeded")
        throw new HttpError(409, { error: "Only successful payments can be refunded." });

    return payment;
}

async function applyRefund(connection, { paymentId, amount, reason }) {
    const refundAmount = positiveAmount(amount);
    if (!refundAmount) throw bad("Refund amount must be positive.");

    const payment = await lockPayment(connection, paymentId);
    const remaining = money(payment.amount - await refundedTotal(connection, paymentId));

    if (refundAmount > remaining)
        throw bad("Refund exceeds the remaining refundable amount.", {
            remaining_refundable: remaining
        });

    const [providers] = await repository.paymentProviders(connection, paymentId);
    await lockProviders(connection, providers.map(row => row.provider_id));
    const [earnings] = await repository.lockPaymentEarnings(connection, [paymentId]);

    const adjustments = [];

    const amounts = allocateAmounts(refundAmount, earnings.map(earning => Number(earning.gross_amount)));

    for (const [index, earning] of earnings.entries()) {
        const gross = amounts[index];
        const commission = money(Math.max(gross - Number(earning.net_amount),
            Math.min(gross, Number(earning.commission_amount), prorateMoney(earning.commission_amount, refundAmount, remaining))));
        const net = money(gross - commission);

        const balance = await providerBalance(connection, earning.provider_id, true);

        if (money(balance.total - net) < balance.committed)
            throw new HttpError(409, {
                error: `Refund would conflict with existing withdrawals for provider ${earning.provider_id}.`
            });

        await repository.reduceEarnings(connection, [gross, commission, net, earning.id]);

        adjustments.push({
            provider_id: earning.provider_id,
            gross_reduction: gross,
            commission_reduction: commission,
            net_reduction: net
        });
    }

    const refundReference = makeRef("REF");

    const [result] = await repository.insertRefund(connection, [refundReference, paymentId, refundAmount, reason ?? null]);

    if (refundAmount === remaining)
        await repository.markPaymentRefunded(connection, [paymentId]);

    const tell = (to, id, title, message) => notify(connection, {
        to, id, type: "RefundSucceeded", title, message, paymentId, refundId: result.insertId
    });

    await tell("Customer", payment.customer_id, "Refund processed",
        `Refund ${refundReference} succeeded for $${refundAmount.toFixed(2)}.`);

    for (const item of adjustments)
        await tell("Provider", item.provider_id, "Earnings adjusted",
            `Refund ${refundReference} reduced your net earnings by $${item.net_reduction.toFixed(2)}.`);

    return {
        refund_id: result.insertId,
        refund_reference: refundReference,
        payment_id: paymentId,
        amount: refundAmount,
        remaining_refundable: money(remaining - refundAmount),
        status: "Succeeded",
        provider_adjustments: adjustments
    };
}

async function listRefunds({ paymentId = null } = {}) {
    const rows = await repository.listRefunds(paymentId);
    return rows;
}

function createRefundRequest({ customerId, paymentId, amount, reason, requestKey = null }) {
    return financialTransaction({ id: customerId, role: "Customer" }, requestKey,
        "customer-refund-request", { paymentId, amount: amount ?? null, reason }, async connection => {
        const payment = await lockPayment(connection, paymentId, customerId);

        const [[pending]] = await repository.pendingRequestTotal(connection, [paymentId]);

        const available = money(
            Number(payment.amount) - await refundedTotal(connection, paymentId) - money(pending.total)
        );

        const requested = amount == null ? available : positiveAmount(amount);

        if (!requested || requested <= 0 || requested > available)
            throw bad("Invalid refund amount or insufficient available balance.", {
                available_to_request: Math.max(0, available)
            });

        const [result] = await repository.insertRequest(connection, [paymentId, customerId, requested, reason ?? null]);

        await notify(connection, {
            to: "Customer", id: customerId, type: "RefundRequested", title: "Refund requested",
            message: `Your refund request #${result.insertId} for $${requested.toFixed(2)} on payment ${payment.payment_reference} is waiting for review.`,
            paymentId
        });

        await notifyAdmins(connection, {
            notificationType: "RefundRequested",
            title: "Refund request needs review",
            message: `Refund request #${result.insertId} for $${requested.toFixed(2)} is waiting for admin review.`,
            paymentId
        });

        return {
            refund_request_id: result.insertId,
            payment_id: paymentId,
            amount: requested,
            reason: reason ?? null,
            status: "Pending",
            currency: "USD"
        };
    });
}

async function listRefundRequests({ customerId = null, status = null } = {}) {
    const rows = await repository.listRefundRequests(customerId, status);

    return rows.map(withCurrency);
}

function decideRefundRequest({ requestId, status, adminNote, admin }) {
    if (!["Approved", "Rejected"].includes(status))
        throw bad("Status must be Approved or Rejected.");

    return withTransaction(async connection => {
        const request = await repository.findRequest(connection, requestId);

        if (!request) throw new HttpError(404, { error: "Refund request not found." });

        if (request.status !== "Pending")
            throw new HttpError(409, {
                error: `This refund request was already ${request.status.toLowerCase()}.`,
                status: request.status
            });

        let refund = null;

        if (status === "Approved") {
            refund = await applyRefund(connection, {
                paymentId: request.payment_id,
                amount: Number(request.amount),
                reason: request.reason
            });
        } else {
            await notify(connection, {
                to: "Customer", id: request.customer_id, type: "RefundRejected",
                title: "Refund request rejected",
                message: `Your refund request #${request.id} for $${money(request.amount).toFixed(2)} was rejected.${adminNote ? " Note: " + adminNote : ""}`,
                paymentId: request.payment_id
            });
        }

        await repository.decideRequest(connection, [status, adminNote ?? null, admin.id, refund?.refund_id ?? null, requestId]);

        await logAudit(connection, admin, `REFUND_REQUEST_${status.toUpperCase()}`, "refund_request", requestId, {
            payment_id: request.payment_id,
            customer_id: request.customer_id,
            amount: money(request.amount),
            admin_note: adminNote ?? null,
            refund_id: refund?.refund_id ?? null
        });

        return {
            message: `Refund request ${status.toLowerCase()}${refund ? "; simulated refund recorded, no real money was transferred" : ""}.`,
            refund_request_id: requestId,
            previous_status: "Pending",
            status,
            refund
        };
    });
}

async function recordRefund({ paymentId, amount, reason }, actor, requestKey = null) {
    return financialTransaction(actor, requestKey, "admin-refund",
        { paymentId, amount, reason: reason ?? null }, async connection => {
        const created = await applyRefund(connection, { paymentId, amount, reason });

        await logAudit(connection, actor, "REFUND_RECORDED_BY_ADMIN", "refund", created.refund_id, {
            payment_id: paymentId, amount: created.amount, reason
        });

        return created;
    });
}

module.exports = { recordRefund, applyRefund, listRefunds, createRefundRequest, listRefundRequests, decideRefundRequest };
