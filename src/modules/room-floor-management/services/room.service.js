const Room = require("../models/room.model");

class RoomService {
  async getRooms(filters = {}) {
    const query = {};

    if (filters.status && filters.status !== "all") {
      const statusMap = {
        available: "Trống",
        occupied: "Đã thuê",
        maintenance: "Bảo trì",
      };
      query.status = statusMap[filters.status];
    }

    if (filters.floor && filters.floor !== "all") {
      query.floor = parseInt(filters.floor);
    }

    if (filters.priceRange && filters.priceRange !== "all") {
      if (filters.priceRange === "low") {
        query.price = { $lt: 4000000 };
      } else if (filters.priceRange === "medium") {
        query.price = { $gte: 4000000, $lte: 6000000 };
      } else if (filters.priceRange === "high") {
        query.price = { $gt: 6000000 };
      }
    }

    return await Room.find(query).sort({ createdAt: -1 });
  }

  async getRoomById(id) {
    return await Room.findById(id);
  }
}

module.exports = new RoomService();
