// Local development only: create verified users for Swagger testing.
// Run with: npm run seed:test-users
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
const registryPath = path.join(__dirname, ".test-users.json");

const TEST_PASSWORD = "Test12345!";
const accounts = [
    { firstName: "Test", lastName: "Admin", email: "admin@test.com", role: "admin" },
    { firstName: "Test", lastName: "Customer", email: "customer@test.com", role: "customer" },
    { firstName: "Test", lastName: "Provider", email: "provider@test.com", role: "provider" }
];

async function main() {
    if (process.env.NODE_ENV === "production") {
        throw new Error("Refusing to create test accounts in production.");
    }

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "cloud_marketplace"
    });

    try {
        const registry = fs.existsSync(registryPath) ? JSON.parse(fs.readFileSync(registryPath, "utf8")) : [];
        const hash = await bcrypt.hash(TEST_PASSWORD, 12);
        for (const account of accounts) {
            // Never overwrite an existing account or reset somebody's password.
            const [existing] = await connection.execute(
                "SELECT user_id, role FROM Users WHERE email = ? LIMIT 1",
                [account.email]
            );
            if (existing.length) {
                console.log(`Skipped ${account.email}: already exists (role: ${existing[0].role}).`);
                continue;
            }

            const [inserted] = await connection.execute(
                `INSERT INTO Users
                   (first_name, last_name, email, password_hash, role, email_verified_at)
                 VALUES (?, ?, ?, ?, ?, NOW())`,
                [account.firstName, account.lastName, account.email, hash, account.role]
            );
            registry.push({ userId: inserted.insertId, email: account.email, role: account.role });
            fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + "\n", { mode: 0o600 });
            console.log(`Created ${account.role}: ${account.email}`);
        }
        console.log("Test accounts seeded. Use the documented test password in Swagger.");
    } finally {
        await connection.end();
    }
}

main().catch(error => {
    console.error("Test user seeding failed:", error.message);
    process.exitCode = 1;
});
