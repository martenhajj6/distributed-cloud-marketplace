
const express = require('express');
const path = require('path');

const app = express();
const port = 3000;

app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Distributed Cloud Marketplace API is running'
    });
});

app.use(express.static(path.join(__dirname, '../frontend')));

app.listen(port, () => {
    console.log(`Server running at http://localhost:` + port);
});