// Stable guard rows serialize balance-changing operations even when no earnings
// or withdrawal rows exist yet. Always acquire multiple guards in numeric order.
async function lockProviders(connection, ids) {
    const sorted = [...new Set(ids.map(Number))].sort((a, b) => a - b);
    for (const id of sorted) {
        await connection.execute(`INSERT INTO finance_locks(kind, owner_id)
            VALUES ('Provider', ?) ON DUPLICATE KEY UPDATE owner_id = owner_id`, [id]);
    }
}

module.exports = { lockProviders };
