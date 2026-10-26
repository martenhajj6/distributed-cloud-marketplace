const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

module.exports = { money, positiveInteger, isDate };
