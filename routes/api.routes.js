const express = require("express");
const db = require("../models");

const ApiRouter = express.Router();

//Question 1 : 
ApiRouter.get("/products", async (req, res, next) => {
    try {


    } catch (error) {
        res.status(500).json({
            error: {
                status: 500,
                message: error.message,
            }
        })
    }

})


module.exports = ApiRouter;