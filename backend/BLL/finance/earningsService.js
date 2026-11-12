const repository = require("../../DAL/earnings");
const { money } = require("../../utils/util");
const { withCurrency } = require("../../utils/helpers");

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

const listEarningLines = providerId => repository.statement1([providerId]);

// Net earnings, committed withdrawals and what is still available (lock = FOR UPDATE)
async function providerBalance(conn, providerId, lock = false) {
    const { earned, withdrawn } = await repository.balanceRows(conn, providerId, lock);
    const total = money(earned.reduce((sum, row) => sum + Number(row.net_amount), 0));
    const committed = money(withdrawn.reduce((sum, row) => sum + Number(row.amount), 0));

    return { total, committed, available: money(total - committed) };
}

module.exports = { getEarnings, getEarningsForProvider, listEarningLines, providerBalance };
