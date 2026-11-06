const express = require("express");
const db = require("../dbconn");
const { requireRole } = require("../middleware/access");
const { money, positiveInteger, logAudit } = require("../utils/util");
const { handle, bad, notFound } = require("../utils/helpers");
const { RESOURCE_TYPES, CLOUD_CLASSES } = require("../utils/constants");
const { withTransaction } = require("../utils/tx");

const router = express.Router();
const admin = requireRole("Admin");

const validPrice = price => typeof price === "number" && Number.isFinite(price) && price >= 0;

const recordPrice = (connection, ruleId, oldPrice, newPrice) => connection.execute(
    "INSERT INTO pricing_history (pricing_rule_id, old_price, new_price) VALUES (?, ?, ?)",
    [ruleId, oldPrice, newPrice]
);

// List pricing rules
router.get("/", handle(async (req, res) => {
    const [rows] = await db.execute(`
        SELECT id, resource_type, cloud_class, unit_price, created_at
        FROM pricing_rules ORDER BY resource_type, cloud_class
    `);

    res.json(rows);
}, "Could not load pricing rules."));

// Calculate monthly price
router.post("/calculate", handle(async (req, res) => {
    const { cloud_class, cpu_cores, ram_gb, storage_gb, gpu_units = 0 } = req.body;
    const amounts = { CPU: cpu_cores, RAM: ram_gb, Storage: storage_gb, GPU: gpu_units };

    if (!CLOUD_CLASSES.includes(cloud_class)) throw bad("Invalid cloud class.");

    for (const [type, amount] of Object.entries(amounts))
        if (!validPrice(amount)) throw bad(`${type} must be a non-negative number.`);

    const [rows] = await db.execute(
        "SELECT resource_type, unit_price FROM pricing_rules WHERE cloud_class = ?", [cloud_class]
    );

    const rates = Object.fromEntries(rows.map(r => [r.resource_type, Number(r.unit_price)]));
    const missing = RESOURCE_TYPES.filter(type => rates[type] === undefined);

    if (missing.length)
        return res.status(409).json({ error: `Missing pricing rules: ${missing.join(", ")}` });

    const breakdown = Object.fromEntries(
        RESOURCE_TYPES.map(type => [type, money(amounts[type] * rates[type])])
    );

    res.json({
        cloud_class,
        billing_period: "monthly estimate",
        resources: { cpu_cores, ram_gb, storage_gb, gpu_units },
        unit_prices: rates,
        price_breakdown: breakdown,
        estimated_monthly_price: money(Object.values(breakdown).reduce((sum, v) => sum + v, 0))
    });
}, "Could not calculate resource price."));

// Create pricing rule
router.post("/", admin, handle(async (req, res) => {
    const { resource_type, cloud_class, unit_price } = req.body;

    if (!RESOURCE_TYPES.includes(resource_type) || !CLOUD_CLASSES.includes(cloud_class) || !validPrice(unit_price))
        throw bad("Invalid resource type, class, or price.");

    const id = await withTransaction(async connection => {
        const [result] = await connection.execute(
            "INSERT INTO pricing_rules (resource_type, cloud_class, unit_price) VALUES (?, ?, ?)",
            [resource_type, cloud_class, unit_price]
        );

        await recordPrice(connection, result.insertId, unit_price, unit_price);

        await logAudit(connection, req.user, "PRICING_RULE_CREATED", "pricing_rule", result.insertId, {
            resource_type, cloud_class, unit_price
        });

        return result.insertId;
    });

    res.status(201).json({ message: "Pricing rule created", id, resource_type, cloud_class, unit_price });
}, "Could not create pricing rule."));

// Update pricing rule
router.put("/:id", admin, handle(async (req, res) => {
    const id = positiveInteger(req.params.id);
    const price = req.body.unit_price;

    if (!id || !validPrice(price)) throw bad("Invalid pricing rule ID or price.");

    const oldPrice = await withTransaction(async connection => {
        const [rows] = await connection.execute(
            "SELECT unit_price FROM pricing_rules WHERE id = ? FOR UPDATE", [id]
        );

        if (!rows.length) throw notFound("Pricing rule not found.");

        const old = Number(rows[0].unit_price);

        await connection.execute("UPDATE pricing_rules SET unit_price = ? WHERE id = ?", [price, id]);
        await recordPrice(connection, id, old, price);
        await logAudit(connection, req.user, "PRICING_RULE_UPDATED", "pricing_rule", id, {
            old_price: old, new_price: price
        });

        return old;
    });

    res.json({ message: "Price updated", id, old_price: oldPrice, new_price: price });
}, "Could not update price."));

// Pricing history
router.get("/:id/history", admin, handle(async (req, res) => {
    const id = positiveInteger(req.params.id);
    if (!id) throw bad("Invalid pricing rule ID.");

    const [rows] = await db.execute(`
        SELECT id, pricing_rule_id, old_price, new_price, changed_at
        FROM pricing_history WHERE pricing_rule_id = ?
        ORDER BY changed_at DESC, id DESC
    `, [id]);

    res.json(rows);
}, "Could not load pricing history."));

module.exports = router;
