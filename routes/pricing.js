const express = require("express");
const db = require("../db");
const { logAudit } = require("../services/audit");

const router = express.Router();
// Pricing rules and price calculations.
// Changing prices and reading price history is for admins only.

// List current pricing rules.
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, resource_type, cloud_class, unit_price, created_at
       FROM pricing_rules
       ORDER BY resource_type, cloud_class`
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Could not load pricing rules. Check your database connection and SQL setup."
    });
  }
});

// Calculate estimated monthly price.
router.post("/calculate", async (req, res) => {
  const { cloud_class, cpu_cores, ram_gb, storage_gb } = req.body;
  const gpu_units = req.body.gpu_units === undefined ? 0 : req.body.gpu_units;
  const allowedClasses = ["Economy", "Business", "Critical"];
  const amounts = {
    CPU: cpu_cores,
    RAM: ram_gb,
    Storage: storage_gb,
    GPU: gpu_units
  };

  if (!allowedClasses.includes(cloud_class)) {
    return res.status(400).json({
      error: "cloud_class must be Economy, Business, or Critical."
    });
  }

  for (const [name, value] of Object.entries(amounts)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return res.status(400).json({
        error: `${name} amount must be a non-negative number.`
      });
    }
  }

  try {
    const [rows] = await db.execute(
      `SELECT resource_type, unit_price
       FROM pricing_rules
       WHERE cloud_class = ?`,
      [cloud_class]
    );

    const rates = {};
    for (const row of rows) {
      rates[row.resource_type] = Number(row.unit_price);
    }

    const requiredTypes = ["CPU", "RAM", "Storage", "GPU"];
    const missing = requiredTypes.filter(type => rates[type] === undefined);

    if (missing.length > 0) {
      return res.status(409).json({
        error: `Missing pricing rules for ${cloud_class}: ${missing.join(", ")}.`
      });
    }

    const breakdown = {
      CPU: Number((cpu_cores * rates.CPU).toFixed(2)),
      RAM: Number((ram_gb * rates.RAM).toFixed(2)),
      Storage: Number((storage_gb * rates.Storage).toFixed(2)),
      GPU: Number((gpu_units * rates.GPU).toFixed(2))
    };

    const total = Number(
      Object.values(breakdown)
        .reduce((sum, amount) => sum + amount, 0)
        .toFixed(2)
    );

    res.json({
      cloud_class,
      billing_period: "monthly estimate",
      resources: { cpu_cores, ram_gb, storage_gb, gpu_units },
      unit_prices: rates,
      price_breakdown: breakdown,
      estimated_monthly_price: total
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Could not calculate resource price."
    });
  }
});

// Create a pricing rule and record its initial price in history.
router.post("/", async (req, res) => {
  const { resource_type, cloud_class, unit_price } = req.body;
  const allowedTypes = ["CPU", "RAM", "Storage", "GPU"];
  const allowedClasses = ["Economy", "Business", "Critical"];
  const price = unit_price;

  if (
    !allowedTypes.includes(resource_type) ||
    !allowedClasses.includes(cloud_class) ||
    typeof price !== "number" ||
    !Number.isFinite(price) ||
    price < 0
  ) {
    return res.status(400).json({
      error: "Provide resource_type (CPU, RAM, Storage, GPU), cloud_class (Economy, Business, Critical), and a non-negative numeric unit_price."
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [result] = await connection.execute(
      `INSERT INTO pricing_rules (resource_type, cloud_class, unit_price)
       VALUES (?, ?, ?)`,
      [resource_type, cloud_class, price]
    );

    await connection.execute(
      `INSERT INTO pricing_history (pricing_rule_id, old_price, new_price)
       VALUES (?, ?, ?)`,
      [result.insertId, price, price]
    );

    await logAudit(connection, req.context, "PRICING_RULE_CREATED", "pricing_rule", result.insertId, {
      resource_type, cloud_class, unit_price: price
    });

    await connection.commit();

    res.status(201).json({
      message: "Pricing rule created",
      id: result.insertId,
      resource_type,
      cloud_class,
      unit_price: price
    });
  } catch (error) {
    if (connection) await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: `A pricing rule for ${resource_type} and ${cloud_class} already exists. Use PUT /api/pricing/{id} to update its price.`
      });
    }

    console.error(error);
    return res.status(500).json({
      error: "Could not create pricing rule."
    });
  } finally {
    if (connection) connection.release();
  }
});

// Update a price and record the change in history.
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const price = req.body.unit_price;

  if (
    !Number.isInteger(id) ||
    id < 1 ||
    typeof price !== "number" ||
    !Number.isFinite(price) ||
    price < 0
  ) {
    return res.status(400).json({
      error: "Use a valid pricing rule ID and a non-negative numeric unit_price."
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      "SELECT unit_price FROM pricing_rules WHERE id = ? FOR UPDATE",
      [id]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        error: "Pricing rule not found."
      });
    }

    const oldPrice = Number(rows[0].unit_price);

    await connection.execute(
      "UPDATE pricing_rules SET unit_price = ? WHERE id = ?",
      [price, id]
    );

    await connection.execute(
      `INSERT INTO pricing_history (pricing_rule_id, old_price, new_price)
       VALUES (?, ?, ?)`,
      [id, oldPrice, price]
    );

    await logAudit(connection, req.context, "PRICING_RULE_UPDATED", "pricing_rule", id, {
      old_price: oldPrice, new_price: price
    });

    await connection.commit();

    res.json({
      message: "Price updated",
      id,
      old_price: oldPrice,
      new_price: price
    });
  } catch (error) {
    if (connection) await connection.rollback();

    console.error(error);
    res.status(500).json({
      error: "Could not update price."
    });
  } finally {
    if (connection) connection.release();
  }
});

// Get the price-change history for a pricing rule.
router.get("/:id/history", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({
      error: "Use a valid pricing rule ID."
    });
  }

  try {
    const [rows] = await db.execute(
      `SELECT id, pricing_rule_id, old_price, new_price, changed_at
       FROM pricing_history
       WHERE pricing_rule_id = ?
       ORDER BY changed_at DESC, id DESC`,
      [id]
    );

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Could not load pricing history."
    });
  }
});

module.exports = router;