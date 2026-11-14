// Shared money calculations, validation, and error types.
const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function toCents(value) {
    const cents = Math.round(Number(value) * 100);
    if (!Number.isSafeInteger(cents)) throw new RangeError("Money exceeds safe cent precision.");
    return cents;
}

const sumMoney = values => values.reduce((sum, value) => {
    const next = sum + toCents(value);
    if (!Number.isSafeInteger(next)) throw new RangeError("Money total exceeds safe cent precision.");
    return next;
}, 0) / 100;

// Round positive proportional money exactly, with half cents rounded upward.
function prorateMoney(amount, numerator, denominator) {
    const a = BigInt(toCents(amount));
    const n = BigInt(toCents(numerator));
    const d = BigInt(toCents(denominator));
    if (a < 0n || n < 0n || d <= 0n) throw new RangeError("Invalid money proportion.");
    const result = (a * n * 2n + d) / (2n * d);
    if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Money proportion exceeds safe precision.");
    return Number(result) / 100;
}

// Split money proportionally while preserving the exact total to the cent.
function allocateAmounts(total, weights) {
    const cents = BigInt(toCents(total));
    const units = weights.map(value => BigInt(toCents(value)));
    if (cents < 0n || units.some(value => value < 0n)) throw new RangeError("Allocations must be non-negative.");
    const sum = units.reduce((result, value) => result + value, 0n);
    if (!sum) {
        if (cents) throw new RangeError("A positive total requires a positive allocation weight.");
        return weights.map(() => 0);
    }
    const shares = units.map(value => cents * value);
    const allocated = shares.map(value => value / sum);
    let remaining = cents - allocated.reduce((result, value) => result + value, 0n);
    const order = shares.map((value, index) => ({ index, fraction: value % sum }))
        .sort((a, b) => a.fraction === b.fraction ? a.index - b.index : a.fraction > b.fraction ? -1 : 1);
    for (const item of order) {
        if (remaining-- <= 0n) break;
        allocated[item.index] += 1n;
    }
    return allocated.map(value => Number(value) / 100);
}

function positiveInteger(value) {
    if (value === null || value === undefined || value === "" || !["number", "string"].includes(typeof value)) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function isDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

class HttpError extends Error {
    constructor(status, body) {
        const payload = typeof body === "string" ? { error: body } : body;
        super(payload.error || "Request failed");
        this.status = status;
        this.body = payload;
    }
}

module.exports = { money, toCents, sumMoney, prorateMoney, allocateAmounts, positiveInteger, isDate, HttpError };
