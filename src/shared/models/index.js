const User = require("../../modules/authentication/models/user.model");
const Room = require("../../modules/room-floor-management/models/room.model");

const db = {
  User,
  Room,
};

module.exports = db;
