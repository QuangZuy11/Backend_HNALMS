const mongoose = require("mongoose");
const User = require("./User.model");

const db = {}

db.User = User

module.exports = db;