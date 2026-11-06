// mysql2/promise lets us use async/await with MySQL queries.
// We use a pool instead of one connection because several requests can run at once.
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const mysql = require("mysql2/promise");
const con = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "cloud_marketplace",
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true
});
// Example: const [rows] = await con.query("SELECT * FROM invoices");
module.exports = con;
