// Remove only accounts registered by seedTestUsers.js. Never delete real users.
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const registryPath = path.join(__dirname, ".test-users.json");
const allowed = new Set(["admin@test.com", "customer@test.com", "provider@test.com"]);

async function main() {
    if (process.env.NODE_ENV === "production") throw new Error("Test-account deletion is disabled in production.");
    if (!fs.existsSync(registryPath)) {
        console.log("No tracked seed accounts found. Nothing deleted.");
        return;
    }
    let registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    if (!Array.isArray(registry)) throw new Error("Invalid test-account registry.");
    const db = await mysql.createConnection({
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "cloud_marketplace"
    });
    try {
        let failures = 0;
        for (const entry of [...registry]) {
            if (!allowed.has(entry.email) || !Number.isSafeInteger(entry.userId) || entry.userId < 1) {
                console.log("Skipped unrecognized registry entry.");
                failures++;
                continue;
            }
            const [users] = await db.execute(
                "SELECT user_id, email, role, first_name FROM Users WHERE user_id = ? AND email = ? AND role = ? LIMIT 1",
                [entry.userId, entry.email, entry.role]
            );
            if (!users.length) {
                console.log(`Already absent or changed: ${entry.email}.`);
                registry = registry.filter(item => item !== entry);
            } else if (users[0].first_name !== "Test") {
                console.log(`Skipped modified account: ${entry.email}.`);
                failures++;
                continue;
            } else {
                try {
                    await db.execute("DELETE FROM Users WHERE user_id = ? AND email = ? AND role = ? AND first_name = 'Test'", [entry.userId, entry.email, entry.role]);
                    console.log(`Deleted ${entry.email}.`);
                    registry = registry.filter(item => item !== entry);
                } catch (error) {
                    if (error.code === "ER_ROW_IS_REFERENCED_2" || error.code === "ER_ROW_IS_REFERENCED") {
                        console.error(`Cannot delete ${entry.email}: referenced by marketplace data. Remove linked test data first or reset the local TEST database. No related records were deleted.`);
                    } else {
                        console.error(`Failed to delete ${entry.email}: ${error.message}`);
                    }
                    failures++;
                }
            }
            fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n", { mode: 0o600 });
        }
        if (failures) process.exitCode = 1;
        else console.log("Tracked test accounts removed. Restart or log out to clear any active local sessions.");
    } finally {
        await db.end();
    }
}
main().catch(error => { console.error("Test-user cleanup failed:", error.message); process.exitCode = 1; });
