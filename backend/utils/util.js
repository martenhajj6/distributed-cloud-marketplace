// Shared money calculations, validation, and error types.
const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

// Split money proportionally while preserving the exact total to the cent.
function allocateAmounts(total, weights) {
    const cents = Math.round(money(total) * 100);
    const sum = weights.reduce((result, value) => result + Number(value), 0);
    if (!sum) return weights.map(() => 0);
    const shares = weights.map(value => cents * Number(value) / sum);
    const allocated = shares.map(Math.floor);
    let remaining = cents - allocated.reduce((result, value) => result + value, 0);
    const order = shares.map((value, index) => ({ index, fraction: value - allocated[index] }))
        .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (const item of order) {
        if (remaining-- <= 0) break;
        allocated[item.index]++;
    }
    return allocated.map(value => value / 100);
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

module.exports = { money, allocateAmounts, positiveInteger, isDate, HttpError };
