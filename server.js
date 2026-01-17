const express = require('express');
const bodyParser = require("body-parser");
const morgan = require("morgan");
const httpErrors = require("http-errors");
require("dotenv").config();

const connectDB = require("./config/db");
const db = require("./models/index");
const ApiRouter = require("./routes/api.routes");

const app = express();
app.use(bodyParser.json());
app.use(morgan("dev"));


app.use("/api", ApiRouter);


app.get('/', async (req, res) => {
    try {
        res.send({ message: 'Welcome to HNALMS' });
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


const PORT = process.env.PORT || 9999;
app.listen(PORT, () => { console.log(`Server running on port ${PORT}`), connectDB() });