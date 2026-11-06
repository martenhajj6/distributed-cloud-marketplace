// Shared helpers. Lives next to utils/util.js (which it builds on).
const crypto = require("crypto");
const db = require("../dbconn");
const { HttpError, sendError, money, positiveInteger } = require("./util");

const query = async (sql, params = []) => (await db.execute(sql, params))[0];

const bad = (message, extra = {}) => new HttpError(400, { error: message, ...extra });
const notFound = message => new HttpError(404, { error: message });

const makeRef = prefix =>
    `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

const cleanText = (value, max = 255) =>
    value == null ? null : String(value).trim().slice(0, max);

// Positive money amount, or null when missing / not a number / not > 0
const positiveAmount = value => {
    if (value == null || value === "") return null;
    const n = Number(value);
    const amount = Number.isFinite(n) ? money(n) : 0;
    return amount > 0 ? amount : null;
};

// Optional positive-integer query filter: undefined -> null, invalid -> 400
const optionalId = (value, name) => {
    if (value === undefined) return null;
    const id = positiveInteger(value);
    if (!id) throw bad(`${name} must be a positive integer.`);
    return id;
};

const withCurrency = row => ({ ...row, currency: "USD" });

// Route wrapper: catches errors, maps duplicate-key errors to 409
const handle = (fn, message = "Request failed.", duplicate = "Record already exists.") =>
    async (req, res) => {
        try {
            await fn(req, res);
        } catch (error) {
            if (error.code === "ER_DUP_ENTRY")
                return res.status(409).json({ error: duplicate });
            sendError(res, error, message);
        }
    };

// Builds "WHERE a = ? AND b = ?" from an object; null/undefined values are skipped
const where = filters => {
    const entries = Object.entries(filters).filter(([, v]) => v != null);

    return {
        sql: entries.length ? "WHERE " + entries.map(([k]) => `${k} = ?`).join(" AND ") : "",
        params: entries.map(([, v]) => v)
    };
};

module.exports = {
    query, bad, notFound, makeRef, cleanText, positiveAmount,
    optionalId, withCurrency, handle, where
};
