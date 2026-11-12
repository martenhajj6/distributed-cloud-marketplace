const { handle } = require("../middleware/access");
const express = require("express");
const { HttpError, isDate, positiveInteger } = require("../../utils/util");
const { bad, optionalId } = require("../../utils/helpers");
const { RESOURCE_TYPES, CLOUD_CLASSES } = require("../../utils/constants");
const discounts = require("../../BLL/finance/discountService");
const billing = require("../../BLL/finance/invoiceService");
const usageBilling = require("../../BLL/finance/usageBillingService");

const router = express.Router();

const validPeriod = (start, end) => isDate(start) && isDate(end) && end > start;

// Create simulated invoice
router.post("/invoices", handle(async (req, res) => {
    const { customer_id, billing_period_start: start, billing_period_end: end, resources } = req.body;
    const customerId = positiveInteger(customer_id);

    if (!customerId || !validPeriod(start, end) || !Array.isArray(resources) || !resources.length || resources.some(item => !item || typeof item !== "object" || Array.isArray(item) || !["number", "string"].includes(typeof item.quantity)))
        throw bad("Invalid customer, period, or resources.");

    // Quantities are validated by priceItems
    const items = resources.map(({ resource_type, cloud_class, quantity }) =>
        ({ resource_type, cloud_class, quantity: Number(quantity) }));

    if (items.some(i => !RESOURCE_TYPES.includes(i.resource_type) || !CLOUD_CLASSES.includes(i.cloud_class)))
        throw bad("Invalid resource type or class.");

    const invoice = await billing.createInvoice({
            customerId,
            periodStart: start,
            periodEnd: end,
            discountCode: discounts.normalizeCode(req.body.discount_code),
            items
        });

    res.status(201).json({ message: "Simulated invoice generated", ...invoice });
}, "Could not generate invoice."));

// Create usage-based invoice or preview
router.post("/usage-invoices", handle(async (req, res) => {
    const { customer_id, billing_period_start: start, billing_period_end: end, dry_run } = req.body;
    const customerId = positiveInteger(customer_id);

    if (!customerId || !validPeriod(start, end)) throw bad("Invalid customer or billing period.");

    const input = {
        customerId,
        periodStart: start,
        periodEnd: end,
        discountCode: discounts.normalizeCode(req.body.discount_code)
    };

    if (dry_run !== undefined && typeof dry_run !== "boolean") throw bad("dry_run must be a boolean.");

    if (dry_run === true) return res.json(await usageBilling.previewUsageInvoice(input));

    const invoice = await usageBilling.generateUsageInvoice(input, req.user);

    res.status(201).json({ message: "Usage-based simulated invoice generated", ...invoice });
}, "Could not generate usage invoice."));

// List invoices
router.get("/invoices", handle(async (req, res) => {
    res.json(await billing.listInvoices(optionalId(req.query.customer_id, "customer_id")));
}, "Could not load invoices."));

// Get invoice details
router.get("/invoices/:id", handle(async (req, res) => {
    const id = positiveInteger(req.params.id);
    if (!id) throw bad("Invalid invoice ID.");

    const invoice = await billing.getInvoice(id);
    if (!invoice) throw new HttpError(404, { error: "Invoice not found." });

    res.json(invoice);
}, "Could not load invoice details."));

module.exports = router;
