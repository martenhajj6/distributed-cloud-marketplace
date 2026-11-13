// Shared helpers. Lives next to utils/util.js (which it builds on).
const crypto = require("crypto");
const { HttpError, money, positiveInteger } = require("./util");

const bad = (message, extra = {}) => new HttpError(400, { error: message, ...extra });
const notFound = message => new HttpError(404, { error: message });

const makeRef = prefix =>
    `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

const cleanText = (value, max = 255) =>
    value == null ? null : String(value).trim().slice(0, max);

// Positive money amount, or null when missing / not a number / not > 0
const positiveAmount = value => {
    if (value == null || value === "" || !["number", "string"].includes(typeof value)) return null;
    const n = Number(value);
    const amount = Number.isFinite(n) ? money(n) : 0;
    return Number.isFinite(amount) && amount > 0 && amount <= 9999999999.99 ? amount : null;
};

// Optional positive-integer query filter: undefined -> null, invalid -> 400
const optionalId = (value, name) => {
    if (value === undefined) return null;
    const id = positiveInteger(value);
    if (!id) throw bad(`${name} must be a positive integer.`);
    return id;
};

const withCurrency = row => ({ ...row, currency: "USD" });

module.exports = {
    bad, notFound, makeRef, cleanText, positiveAmount,
    optionalId, withCurrency
};
