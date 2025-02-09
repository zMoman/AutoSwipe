const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const { exec } = require('child_process');

const app = express();
const port = 3000;

// Middleware
app.use(express.static('public'));
app.use(bodyParser.json());

// Automatically load the database schema
exec('sqlite3 carMarket.db', (err, stdout, stderr) => {
    if (err) {
        console.error('Error executing createMarket.sql:', stderr || err.message);
        process.exit(1);
    }
    console.log('Database schema successfully loaded from createMarket.sql');
});

// Database setup
const db = new sqlite3.Database('./carMarket.db', (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
        process.exit(1);
    }
    console.log('Connected to the SQLite database.');
});

// User Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    const sql = 'SELECT * FROM user WHERE username = ? AND password = ?';
    db.get(sql, [username, password], (err, row) => {
        if (err) {
            res.status(500).json({ error: 'Database error' });
            return;
        }
        if (row) {
            res.status(200).json({ message: 'Login successful' });
        } else {
            res.status(401).json({ error: 'Invalid username or password' });
        }
    });
});

// Create Account
app.post('/api/create-account', (req, res) => {
    const { username, password } = req.body;

    const sql = 'INSERT INTO user (username, password, displayName, reviewLevel) VALUES (?, ?, ?, ?)';
    db.run(sql, [username, password, username, 0], (err) => {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                res.status(400).json({ error: 'Username already exists' });
            } else {
                res.status(500).json({ error: 'Database error' });
            }
            return;
        }
        res.status(201).json({ message: 'Account created successfully' });
    });
});

// Fetch Vehicles by Budget
app.get('/api/vehicles', (req, res) => {
    const budget = parseInt(req.query.budget, 10);

    if (isNaN(budget)) {
        res.status(400).json({ error: 'Invalid budget parameter' });
        return;
    }

    const sql = `
        SELECT vehicle.*, user.displayName, user.reviewLevel
        FROM vehicle
        JOIN user ON vehicle.username = user.username
        WHERE vehicle.price <= ?;
    `;

    db.all(sql, [budget], (err, rows) => {
        if (err) {
            res.status(500).json({ error: 'Database query failed', details: err.message });
            return;
        }
        res.json({ message: 'success', data: rows });
    });
});

// Save a car for a user
app.post('/api/save-car', (req, res) => {
    const { username, vehicleID } = req.body;

    const sql = 'INSERT INTO saved_cars (username, vehicleID) VALUES (?, ?)';
    db.run(sql, [username, vehicleID], (err) => {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                res.status(400).json({ error: 'Car is already saved.' });
            } else {
                res.status(500).json({ error: 'Database error', details: err.message });
            }
            return;
        }
        res.status(201).json({ message: 'Car saved successfully' });
    });
});

// Remove a saved car
app.post('/api/remove-saved-car', (req, res) => {
    const { username, vehicleID } = req.body;

    const sql = 'DELETE FROM saved_cars WHERE username = ? AND vehicleID = ?';
    db.run(sql, [username, vehicleID], function (err) {
        if (err) {
            res.status(500).json({ error: 'Failed to remove car', details: err.message });
            return;
        }

        if (this.changes === 0) {
            res.status(404).json({ error: 'Car not found in saved list' });
        } else {
            res.status(200).json({ message: 'Car removed successfully' });
        }
    });
});

app.get('/api/saved-cars', (req, res) => {
    const { username } = req.query;

    console.log('Saved Cars Request for Username:', username); // Debug log

    if (!username) {
        res.status(400).json({ error: 'Missing username in request' });
        return;
    }

    const sql = `
        SELECT vehicle.*
        FROM saved_cars
        JOIN vehicle ON saved_cars.vehicleID = vehicle.vehicleID
        WHERE saved_cars.username = ?;
    `;

    db.all(sql, [username], (err, rows) => {
        if (err) {
            console.error('Error retrieving saved cars:', err.message);
            res.status(500).json({ error: 'Failed to retrieve saved cars', details: err.message });
            return;
        }

        res.status(200).json({ message: 'success', data: rows });
    });
});

// Save or update preference for a user
app.post('/api/preference', (req, res) => {
    const { username, vehicleID, likesOrDislikes } = req.body;

    // Validate input
    if (!username || !vehicleID || !likesOrDislikes) {
        res.status(400).json({ error: 'Missing username, vehicleID, or likesOrDislikes' });
        return;
    }

    if (likesOrDislikes !== 'likes' && likesOrDislikes !== 'dislikes') {
        res.status(400).json({ error: 'Invalid value for likesOrDislikes. Use "likes" or "dislikes".' });
        return;
    }

    const sql = `
        INSERT INTO preference (username, vehicleID, likesOrDislikes)
        VALUES (?, ?, ?)
        ON CONFLICT(username, vehicleID)
        DO UPDATE SET likesOrDislikes = excluded.likesOrDislikes;
    `;

    db.run(sql, [username, vehicleID, likesOrDislikes], (err) => {
        if (err) {
            console.error('Error updating preference:', err.message);
            res.status(500).json({ error: 'Failed to update preference', details: err.message });
            return;
        }

        res.status(200).json({ message: 'Preference updated successfully' });
    });
});

// Retrieve preferences for a user
app.get('/api/preferences', (req, res) => {
    const { username } = req.query;

    // Validate input
    if (!username) {
        res.status(400).json({ error: 'Missing username in request' });
        return;
    }

    const sql = `
        SELECT vehicle.*, preference.likesOrDislikes
        FROM preference
        JOIN vehicle ON preference.vehicleID = vehicle.vehicleID
        WHERE preference.username = ?;
    `;

    db.all(sql, [username], (err, rows) => {
        if (err) {
            console.error('Error retrieving preferences:', err.message);
            res.status(500).json({ error: 'Failed to retrieve preferences', details: err.message });
            return;
        }

        res.status(200).json({ message: 'success', data: rows });
    });
});


// Start server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

// Close database on exit
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        }
        console.log('Closed the database connection.');
        process.exit(0);
    });
});
