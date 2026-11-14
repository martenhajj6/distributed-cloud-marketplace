const repository = require("../../DAL/finance/pricing");
const db = require("../../DAL/dbconn");
const { withTransaction } = db;
const { money, sumMoney, HttpError } = require("../../utils/util");
const { logAudit } = require("../../DAL/finance/audit");
const { bad, notFound } = require("../../utils/helpers");
const { RESOURCE_TYPES, MAX_MONEY, MAX_QUANTITY } = require("../../utils/constants");
const recordPrice = (connection, ruleId, oldPrice, newPrice) => repository.insertHistory(connection, [ruleId, oldPrice, newPrice]);
const listPrices = async () => (await repository.listActiveRules())[0];
const priceHistory = async id => (await repository.listHistory([id]))[0];

async function calculatePrice({ cloud_class, cpu_cores, ram_gb, storage_gb, gpu_units = 0 }) {
    const amounts = { CPU: cpu_cores, RAM: ram_gb, Storage: storage_gb, GPU: gpu_units };
    if (Object.values(amounts).some(value => typeof value !== "number" ||
        !Number.isFinite(value) || value < 0 || value > MAX_QUANTITY))
        throw bad("Resource quantities must be non-negative numbers within the supported range.");
    const [rows] = await repository.listClassPrices([cloud_class]);

    const rates = Object.fromEntries(rows.map(r => [r.resource_type, Number(r.unit_price)]));
    const missing = RESOURCE_TYPES.filter(type => rates[type] === undefined);

    if (missing.length)
        throw new HttpError(409, { error: `Missing pricing rules: ${missing.join(", ")}` });

    const breakdown = Object.fromEntries(
        RESOURCE_TYPES.map(type => [type, money(amounts[type] * rates[type])])
    );
    if (Object.values(breakdown).some(value => !Number.isFinite(value) || value < 0 || value > MAX_MONEY))
        throw bad("Calculated resource price exceeds the supported monetary limit.");
    const total = sumMoney(Object.values(breakdown));
    if (total > MAX_MONEY) throw bad("Calculated total exceeds the supported monetary limit.");

    return {
        cloud_class,
        billing_period: "monthly estimate",
        resources: { cpu_cores, ram_gb, storage_gb, gpu_units },
        unit_prices: rates,
        price_breakdown: breakdown,
        estimated_monthly_price: total
    };
}

async function createPrice({ resource_type, cloud_class, unit_price }, actor) {
    const id = await withTransaction(async connection => {
        const [existing] = await repository.lockResourceClass(connection, [resource_type, cloud_class]);
        if (existing.length && existing[0].active)
            throw new HttpError(409, { error: `${resource_type} / ${cloud_class} already exists. Edit its price instead.` });

        let ruleId;
        if (existing.length) {
            ruleId = existing[0].id;
            await repository.reactivateRule(connection, [unit_price, ruleId]);
            await recordPrice(connection, ruleId, Number(existing[0].unit_price), unit_price);
        } else {
            const [result] = await repository.insertRule(connection, [resource_type, cloud_class, unit_price]);
            ruleId = result.insertId;
            await recordPrice(connection, ruleId, unit_price, unit_price);
        }
        await logAudit(connection, actor, existing.length ? "PRICING_RULE_REACTIVATED" : "PRICING_RULE_CREATED", "pricing_rule", ruleId, {
            resource_type, cloud_class, unit_price
        });
        return ruleId;
    });

    return id;
}

async function updatePrice(id, price, actor) {
    const oldPrice = await withTransaction(async connection => {
        const [rows] = await repository.lockRule(connection, [id]);

        if (!rows.length || !rows[0].active) throw notFound("Active pricing rule not found.");

        const old = Number(rows[0].unit_price);

        await repository.updatePrice(connection, [price, id]);
        await recordPrice(connection, id, old, price);
        await logAudit(connection, actor, "PRICING_RULE_UPDATED", "pricing_rule", id, {
            old_price: old, new_price: price
        });

        return old;
    });

    return oldPrice;
}

async function deletePrice(id, actor) {
    await withTransaction(async connection => {
        const [rows] = await repository.lockRule(connection, [id]);
        if (!rows.length || !rows[0].active) throw notFound("Active pricing rule not found.");
        await repository.deactivateRule(connection, [id]);
        await logAudit(connection, actor, "PRICING_RULE_DEACTIVATED", "pricing_rule", id, {
            resource_type: rows[0].resource_type,
            cloud_class: rows[0].cloud_class,
            unit_price: Number(rows[0].unit_price)
        });
    });
}

module.exports = { listPrices, priceHistory, calculatePrice, createPrice, updatePrice, deletePrice };
