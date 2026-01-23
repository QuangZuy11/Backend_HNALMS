const roomService = require("../services/room.service");

class RoomController {
  async getRooms(req, res) {
    try {
      const filters = {
        status: req.query.status,
        floor: req.query.floor,
        priceRange: req.query.priceRange,
      };

      const rooms = await roomService.getRooms(filters);

      res.json({
        success: true,
        total: rooms.length,
        data: rooms,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { status: 500, message: error.message },
      });
    }
  }

  async getRoomById(req, res) {
    try {
      const room = await roomService.getRoomById(req.params.id);
      if (!room) {
        return res.status(404).json({
          success: false,
          error: { status: 404, message: "Room not found" },
        });
      }
      res.json({ success: true, data: room });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: { status: 500, message: error.message },
      });
    }
  }
}

module.exports = new RoomController();
