
const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Check whether Express is running
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Distributed Cloud Marketplace API is running'
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

app.listen(port, '127.0.0.1', () => {
    console.log(`Server running at http://localhost:${port}`);
});

