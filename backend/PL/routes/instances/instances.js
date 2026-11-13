const express = require("express");
const { authenticate, requireRole, handle } = require("../../middleware/access");
const { positiveInteger } = require("../../../utils/util");
const { bad } = require("../../../utils/helpers");
const instances = require("../../../BLL/instances/instanceService");

// D1 supplies releaseCapacity(connection, vm) when mounting the router.
module.exports = function createRouter({ releaseCapacity } = {}) {
    const router = express.Router();
    router.use(authenticate, requireRole("Customer", "Admin"));
    const idFrom = req => {
        const id = positiveInteger(req.params.id);
        if (!id) throw bad("Invalid VM ID.");
        return id;
    };
    router.get("/:id", handle(async (req, res) => {
        res.json(await instances.getVM(idFrom(req), req.user));
    }, "Could not load VM."));
    router.post("/:id/start", handle(async (req, res) => {
        res.json(await instances.startVM(idFrom(req), req.user));
    }, "Could not start VM."));
    router.post("/:id/stop", handle(async (req, res) => {
        res.json(await instances.stopVM(idFrom(req), req.user));
    }, "Could not stop VM."));
    router.post("/:id/restart", handle(async (req, res) => {
        res.json(await instances.restartVM(idFrom(req), req.user));
    }, "Could not restart VM."));
    router.get("/:id/activity", handle(async (req, res) => {
        res.json(await instances.getActivityHistory(idFrom(req), req.user));
    }, "Could not load VM activity."));
    router.post("/:id/ip", handle(async (req, res) => {
        res.json(await instances.assignIP(idFrom(req), req.user));
    }, "Could not assign IP."));
    router.delete("/:id/ip", handle(async (req, res) => {
        res.json(await instances.releaseIP(idFrom(req), req.user));
    }, "Could not release IP."));
    router.delete("/:id", handle(async (req, res) => {
        res.json(await instances.deleteVM(idFrom(req), req.user, releaseCapacity));
    }, "Could not delete VM."));
    return router;
};
