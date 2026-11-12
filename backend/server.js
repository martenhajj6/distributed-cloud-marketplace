
const { sessionMiddleware } = require("./sessionConfig");
const express = require('express');
const path = require('path');
const db = require('./db');
const authRoutes = require('./routes/authRoutes');

const app = express();
const port = process.env.PORT || 1337;

// Middleware
app.use(express.json());

app.use(sessionMiddleware);

// Authentication routes
app.use('/api/auth', authRoutes);

// Check whether Express is running
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'CortexOps API is running'
    });
});

// Check whether MySQL is connected
app.get('/api/db-health', async (req, res) => {
    try {
        await db.query('SELECT 1');

        res.json({
            status: 'ok',
            database: 'connected'
        });
    } catch (err) {
        console.error('Database error:', err);

        res.status(503).json({
            status: 'error',
            database: 'unavailable'
        });
    }
});

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Start server
app.listen(port, '0.0.0.0', () => {
    console.log(`CortexOps API running on port ${port}`);
});

