const express = require("express");
const db = require("../dbconn");
const { positiveInteger } = require("../utils/util");
const { handle, bad } = require("../utils/helpers");
const { withTransaction } = require("../utils/tx");
const { requireRole } = require("../middleware/access");
const discounts = require("../services/discountService");

const router = express.Router();
const admin = requireRole("Admin");
const h = fn => handle(fn, "Request failed.", "Discount code already exists.");

router.get("/", admin, h(async (req, res) => {
    res.json(await discounts.listDiscounts(db));
}));

router.post("/", admin, h(async (req, res) => {
    res.status(201).json(await withTransaction(c => discounts.createDiscount(c, req.body, req.user)));
}));

router.patch("/:id", admin, h(async (req, res) => {
    const id = positiveInteger(req.params.id);
    if (!id) throw bad("Invalid ID.");

    res.json(await withTransaction(c => discounts.updateDiscount(c, id, req.body, req.user)));
}));

router.post("/validate", h(async (req, res) => {
    res.json(await discounts.validateDiscount(db, req.body));
}));

module.exports = router;
