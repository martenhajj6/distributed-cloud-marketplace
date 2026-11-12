const { handle, requireRole } = require("../middleware/access");
const express = require("express");
const { positiveInteger } = require("../../utils/util");
const { bad } = require("../../utils/helpers");
const discounts = require("../../BLL/finance/discountService");

const router = express.Router();
const admin = requireRole("Admin");
const h = fn => handle(fn, "Request failed.", "Discount code already exists.");

router.get("/", admin, h(async (req, res) => {
    res.json(await discounts.listDiscounts());
}));

router.post("/", admin, h(async (req, res) => {
    res.status(201).json(await discounts.createDiscount(req.body, req.user));
}));

router.patch("/:id", admin, h(async (req, res) => {
    const id = positiveInteger(req.params.id);
    if (!id) throw bad("Invalid ID.");

    res.json(await discounts.updateDiscount(id, req.body, req.user));
}));

router.post("/validate", h(async (req, res) => {
    res.json(await discounts.validateDiscount(req.body));
}));

module.exports = router;
