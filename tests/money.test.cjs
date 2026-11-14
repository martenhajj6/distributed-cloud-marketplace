const { test } = require('node:test');
const assert = require('node:assert/strict');
const { allocateAmounts, prorateMoney, sumMoney, toCents } = require('../backend/utils/util');
const { positiveAmount } = require('../backend/utils/helpers');

test('cent summation preserves repeated small amounts', () => {
    assert.equal(sumMoney(Array(10000).fill(0.01)), 100);
});
test('proportional rounding handles half cents exactly', () => {
    assert.equal(prorateMoney(0.03, 50, 100), 0.02);
    assert.equal(prorateMoney(9999999999.99, 15, 100), 1500000000);
});
test('allocation preserves every cent with deterministic ties', () => {
    assert.deepEqual(allocateAmounts(0.01, [1, 1, 1]), [0.01, 0, 0]);
    for (let i = 1; i <= 500; i++) {
        const weights = [i * 0.01, 0.01, (501 - i) * 0.01];
        const total = (i * 7919 % 100000) / 100;
        const shares = allocateAmounts(total, weights);
        assert.equal(shares.reduce((n, v) => n + toCents(v), 0), toCents(total));
        assert(shares.every(v => v >= 0));
    }
});
test('large allocation products do not lose integer precision', () => {
    const shares = allocateAmounts(9999999999.99, [9999999999.99, 8888888888.88]);
    assert.equal(sumMoney(shares), 9999999999.99);
});
test('invalid weights and unsafe totals are rejected', () => {
    assert.throws(() => allocateAmounts(1, [0, 0]), RangeError);
    assert.throws(() => allocateAmounts(1, [-1, 2]), RangeError);
    assert.throws(() => toCents(Infinity), RangeError);
});
test('financial inputs reject conversions and sub-cent precision', () => {
    for (const v of ['1', true, null, {}, 0, -1, 1.001, Infinity]) assert.equal(positiveAmount(v), null);
    assert.equal(positiveAmount(0.29), 0.29);
    assert.equal(positiveAmount(9999999999.99), 9999999999.99);
});
