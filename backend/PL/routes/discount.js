const { handle, requireRole } = require("../middleware/access");
const express = require("express");
const { positiveInteger } = require("../../utils/util");
const { bad } = require("../../utils/helpers");
const discounts = require("../../BLL/finance/discountService");

const router = express.Router();
const admin = requireRole("Admin");
const h = (fn, message, duplicate) => handle(fn, message, duplicate);

router.get("/", admin, h(async (req, res) => {
    res.json(await discounts.listDiscounts());
}, "Could not load discount codes."));

router.post("/", admin, h(async (req, res) => {
    res.status(201).json(await discounts.createDiscount(req.body, req.user));
}, "Could not create discount code.", "Discount code already exists."));

router.patch("/:id", admin, h(async (req, res) => {
    const id = positiveInteger(req.params.id);
    if (!id) throw bad("Invalid ID.");

    res.json(await discounts.updateDiscount(id, req.body, req.user));
}, "Could not update discount code.", "Discount code already exists."));

router.post("/validate", h(async (req, res) => {
    res.json(await discounts.validateDiscount(req.body));
}, "Could not validate discount code."));

module.exports = router;
