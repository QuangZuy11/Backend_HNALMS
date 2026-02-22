const User = require("../../modules/authentication/models/user.model");
const Room = require("../../modules/room-floor-management/models/room.model");
const ComplaintRequest = require("../../modules/request-management/models/complaint_requests.model");
const RepairRequest = require("../../modules/request-management/models/repair_requests.model");

const db = {
  User,
  Room,
  ComplaintRequest,
  RepairRequest,
};

module.exports = db;
