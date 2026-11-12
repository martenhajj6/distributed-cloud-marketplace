const repository = require("../../DAL/pricing");
const db = require("../../DAL/dbconn");
const { withTransaction } = db;
const { money, HttpError } = require("../../utils/util");
const { logAudit } = require("../../DAL/audit");
const { notFound } = require("../../utils/helpers");
const { RESOURCE_TYPES } = require("../../utils/constants");
const recordPrice = (connection, ruleId, oldPrice, newPrice) => repository.statement7(connection, [ruleId, oldPrice, newPrice]);
const listPrices = async () => (await repository.statement6())[0];
const priceHistory = async id => (await repository.statement1([id]))[0];

async function calculatePrice({ cloud_class, cpu_cores, ram_gb, storage_gb, gpu_units = 0 }) {
    const amounts = { CPU: cpu_cores, RAM: ram_gb, Storage: storage_gb, GPU: gpu_units };
    const [rows] = await repository.statement5([cloud_class]);

    const rates = Object.fromEntries(rows.map(r => [r.resource_type, Number(r.unit_price)]));
    const missing = RESOURCE_TYPES.filter(type => rates[type] === undefined);

    if (missing.length)
        throw new HttpError(409, { error: `Missing pricing rules: ${missing.join(", ")}` });

    const breakdown = Object.fromEntries(
        RESOURCE_TYPES.map(type => [type, money(amounts[type] * rates[type])])
    );

    return {
        cloud_class,
        billing_period: "monthly estimate",
        resources: { cpu_cores, ram_gb, storage_gb, gpu_units },
        unit_prices: rates,
        price_breakdown: breakdown,
        estimated_monthly_price: money(Object.values(breakdown).reduce((sum, v) => sum + v, 0))
    };
}

async function createPrice({ resource_type, cloud_class, unit_price }, actor) {
    const id = await withTransaction(async connection => {
        const [result] = await repository.statement4(connection, [resource_type, cloud_class, unit_price]);

        await recordPrice(connection, result.insertId, unit_price, unit_price);

        await logAudit(connection, actor, "PRICING_RULE_CREATED", "pricing_rule", result.insertId, {
            resource_type, cloud_class, unit_price
        });

        return result.insertId;
    });

    return id;
}

async function updatePrice(id, price, actor) {
    const oldPrice = await withTransaction(async connection => {
        const [rows] = await repository.statement3(connection, [id]);

        if (!rows.length) throw notFound("Pricing rule not found.");

        const old = Number(rows[0].unit_price);

        await repository.statement2(connection, [price, id]);
        await recordPrice(connection, id, old, price);
        await logAudit(connection, actor, "PRICING_RULE_UPDATED", "pricing_rule", id, {
            old_price: old, new_price: price
        });

        return old;
    });

    return oldPrice;
}

module.exports = { listPrices, priceHistory, calculatePrice, createPrice, updatePrice };
