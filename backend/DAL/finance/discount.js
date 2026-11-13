const fields = "id, code, discount_type, discount_value, max_uses, used_count, expires_at, active, created_at";

// Data Access Layer: SQL statements for discountService.
const db = require("../dbconn");

const statement1 = (connection = db, params = []) => connection.execute(`
        INSERT INTO discount_codes (code, discount_type, discount_value, max_uses, expires_at, active)
        VALUES (?, ?, ?, ?, ?, ?)
    `, params);

async function findByCode(db, code, { forUpdate = false } = {}) {
    const [[discount]] = await db.execute(
        `SELECT ${fields} FROM discount_codes WHERE code = ? ${forUpdate ? "FOR UPDATE" : ""}`,
        [code]
    );

    return discount || null;
}

async function byId(db, id, forUpdate = false) {
    const [[discount]] = await db.execute(`SELECT ${fields} FROM discount_codes WHERE id = ? ${forUpdate ? "FOR UPDATE" : ""}`, [id]);
    return discount || null;
}

const listDiscounts = async db => (await db.execute(`SELECT ${fields} FROM discount_codes ORDER BY id DESC`))[0];

const updateDiscount = (db, id, values) => {
    const keys = Object.keys(values);
    return db.execute(`UPDATE discount_codes SET ${keys.map(k => `${k} = ?`).join(", ")} WHERE id = ?`, [...keys.map(k => values[k]), id]);
};

module.exports = { listDiscounts, updateDiscount, byId, findByCode, statement1 };
