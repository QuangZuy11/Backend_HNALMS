const express = require("express");
const roomController = require("../controllers/room.controller");

const router = express.Router();

router.get("/rooms", roomController.getRooms);
router.get("/rooms/:id", roomController.getRoomById);

module.exports = router;
