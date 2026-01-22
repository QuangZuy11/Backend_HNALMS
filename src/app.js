const express = require('express');
const bodyParser = require("body-parser");
const morgan = require("morgan");
require("dotenv").config();

const connectDB = require("./shared/config/database");
const db = require("./shared/models/index");
const ApiRouter = require("./shared/routes/api.routes");

const app = express();

// Middlewares
app.use(bodyParser.json());
app.use(morgan("dev"));

// Routes
app.use("/api", ApiRouter);
//login
// Home route
app.get('/', async (req, res) => {
    try {
        res.send({ 
            success: true,
            message: 'Welcome to HNALMS - Hoang Nam Apartment Lease Management System',
            version: '1.0.0',
            documentation: '/api/health'
        });
    } catch (error) {
        res.send({ error: error.message });
    }
});

// Test database connection - Get all users
app.get('/test-db', async (req, res) => {
    try {
        const users = await db.User.find();
        res.json({
            success: true,
            message: 'Database connected successfully',
            totalUsers: users.length,
            data: users
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Database connection failed',
            error: error.message
        });
    }
});

// Connect to database
connectDB();

module.exports = app;
