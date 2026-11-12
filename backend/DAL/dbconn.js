
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const mysql = require("mysql2/promise");

const con = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "cloud_marketplace",
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true,
    dateStrings: true
});

con.getConnection()
    .then(connection => {
        console.log("Database connected successfully");
        connection.release();
    })
    .catch(error => {
        console.error("Database connection failed:", error.message);
    });

async function withTransaction(callback) {
    const connection = await con.getConnection();
    try {
        await connection.beginTransaction();
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error("Could not roll back transaction:", rollbackError);
        }
        throw error;
    } finally {
        connection.release();
    }
}

con.withTransaction = withTransaction;
module.exports = con;
