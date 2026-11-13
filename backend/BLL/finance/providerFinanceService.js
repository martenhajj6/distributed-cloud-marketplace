const repository = require("../../DAL/finance/providerFinance");
const { logAudit } = require("../../DAL/finance/audit");
const { withTransaction } = require("../../DAL/dbconn");
const { HttpError, money } = require("../../utils/util");
const { bad, cleanText, positiveAmount, withCurrency } = require("../../utils/helpers");

// Earnings
async function getEarnings(providerId = null) {
    const rows = await repository.listEarnings(providerId);
    return rows.map(withCurrency);
}

async function getEarningsForProvider(providerId) {
    return (await getEarnings(providerId))[0] || withCurrency({
        provider_id: providerId,
        gross_earnings: 0,
        platform_commission: 0,
        net_earnings: 0,
        committed_withdrawals: 0,
        available_balance: 0
    });
}

const listEarningLines = providerId => repository.listEarningLines([providerId]);

async function providerBalance(conn, providerId, lock = false) {
    const { earned, withdrawn } = await repository.balanceRows(conn, providerId, lock);

    const total = money(earned.reduce((sum, row) => sum + Number(row.net_amount), 0));
    const committed = money(withdrawn.reduce((sum, row) => sum + Number(row.amount), 0));

    return {
        total,
        committed,
        available: money(total - committed)
    };
}

// Withdrawals
async function listWithdrawals(providerId = null) {
    const rows = await repository.listWithdrawals(providerId);
    return rows.map(withCurrency);
}

async function createWithdrawal({ providerId, amount, note }) {
    const value = positiveAmount(amount);

    if (!value)
        throw bad("Provide a positive withdrawal amount.");

    return withTransaction(async connection => {
        const { available } = await providerBalance(connection, providerId, true);

        if (value > available) {
            throw new HttpError(400, {
                error: `Requested $${value.toFixed(2)} exceeds your available balance of $${available.toFixed(2)}.`,
                available_balance: available
            });
        }

        const [result] = await repository.insertWithdrawal(connection, [
            providerId,
            value,
            cleanText(note)
        ]);

        return {
            message: "Withdrawal request created (simulated).",
            withdrawal_id: result.insertId,
            provider_id: providerId,
            amount: value,
            currency: "USD",
            status: "Requested",
            available_balance_after_request: money(available - value)
        };
    });
}

const NEXT_STATUS = {
    Requested: ["Approved", "Rejected"],
    Approved: ["Paid", "Rejected"]
};

async function updateWithdrawal(id, status, actor) {
    return withTransaction(async connection => {
        const [rows] = await repository.lockWithdrawalRequest(connection, [id]);

        if (!rows.length)
            throw new HttpError(404, { error: "Withdrawal not found." });

        const old = rows[0].status;

        if (!NEXT_STATUS[old]?.includes(status))
            throw new HttpError(409, { error: `Cannot change ${old} to ${status}.` });

        await repository.updateWithdrawalStatus(connection, [status, id]);

        await logAudit(
            connection,
            actor,
            `WITHDRAWAL_${status.toUpperCase()}`,
            "withdrawal",
            id,
            {
                provider_id: rows[0].provider_id,
                amount: money(rows[0].amount),
                previous_status: old
            }
        );

        return {
            message: "Withdrawal status updated (simulated).",
            withdrawal_id: id,
            previous_status: old,
            status
        };
    });
}

module.exports = {
    getEarnings,
    getEarningsForProvider,
    listEarningLines,
    providerBalance,
    listWithdrawals,
    createWithdrawal,
    updateWithdrawal
};
