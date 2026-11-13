const { handle, requireRole } = require("../../middleware/access");
const pricing = require("../../../BLL/finance/pricingService");
const express = require("express");
const { positiveInteger } = require("../../../utils/util");
const { bad } = require("../../../utils/helpers");
const { RESOURCE_TYPES, CLOUD_CLASSES } = require("../../../utils/constants");

const router = express.Router();
const admin = requireRole("Admin");

const validPrice = price => typeof price === "number" && Number.isFinite(price) && price >= 0 && price <= 99999999.99 && Math.abs(price * 100 - Math.round(price * 100)) < 0.000001;

// List pricing rules
router.get("/", handle(async (req, res) => {
    const rows = await pricing.listPrices();

    res.json(rows);
}, "Could not load pricing rules."));

// Calculate monthly price
router.post("/calculate", handle(async (req, res) => {
    const { cloud_class, cpu_cores, ram_gb, storage_gb, gpu_units = 0 } = req.body;
    const amounts = { CPU: cpu_cores, RAM: ram_gb, Storage: storage_gb, GPU: gpu_units };

    if (!CLOUD_CLASSES.includes(cloud_class)) throw bad("Invalid cloud class.");

    for (const [type, amount] of Object.entries(amounts))
        if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) throw bad(`${type} must be a non-negative number.`);

    res.json(await pricing.calculatePrice(req.body));
}, "Could not calculate resource price."));

// Create pricing rule
router.post("/", admin, handle(async (req, res) => {
    const { resource_type, cloud_class, unit_price } = req.body;

    if (!RESOURCE_TYPES.includes(resource_type) || !CLOUD_CLASSES.includes(cloud_class) || !validPrice(unit_price))
        throw bad("Invalid resource type, class, or price.");

    const id = await pricing.createPrice(req.body, req.user);

    res.status(201).json({ message: "Pricing rule created", id, resource_type, cloud_class, unit_price });
}, "Could not create pricing rule."));

// Update pricing rule
router.put("/:id", admin, handle(async (req, res) => {
    const id = positiveInteger(req.params.id);
    const price = req.body.unit_price;

    if (!id || !validPrice(price)) throw bad("Invalid pricing rule ID or price.");

    const oldPrice = await pricing.updatePrice(id, price, req.user);

    res.json({ message: "Price updated", id, old_price: oldPrice, new_price: price });
}, "Could not update price."));

// Retire a rule without removing its price history or audit records.
router.delete("/:id", admin, handle(async (req, res) => {
    const id = positiveInteger(req.params.id);
    if (!id) throw bad("Invalid pricing rule ID.");
    await pricing.deletePrice(id, req.user);
    res.json({ message: "Pricing rule deleted from the active catalog; history preserved.", id });
}, "Could not delete pricing rule."));

// Pricing history
router.get("/:id/history", admin, handle(async (req, res) => {
    const id = positiveInteger(req.params.id);
    if (!id) throw bad("Invalid pricing rule ID.");

    const rows = await pricing.priceHistory(id);

    res.json(rows);
}, "Could not load pricing history."));

module.exports = router;
