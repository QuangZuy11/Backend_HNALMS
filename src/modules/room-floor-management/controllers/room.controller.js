// const roomService = require("../services/room.service");

// class RoomController {
//   async getRooms(req, res) {
//     try {
//       const filters = {
//         status: req.query.status,
//         floor: req.query.floor,
//         priceRange: req.query.priceRange,
//       };

//       const rooms = await roomService.getRooms(filters);

//       res.json({
//         success: true,
//         total: rooms.length,
//         data: rooms,
//       });
//     } catch (error) {
//       res.status(500).json({
//         success: false,
//         error: { status: 500, message: error.message },
//       });
//     }
//   }

//   async getRoomById(req, res) {
//     try {
//       const room = await roomService.getRoomById(req.params.id);
//       if (!room) {
//         return res.status(404).json({
//           success: false,
//           error: { status: 404, message: "Room not found" },
//         });
//       }
//       res.json({ success: true, data: room });
//     } catch (error) {
//       res.status(500).json({
//         success: false,
//         error: { status: 500, message: error.message },
//       });
//     }
//   }
// }

// module.exports = new RoomController();



// controllers/room.controller.js
const RoomService = require("../services/room.service");

// Helper function để xử lý lỗi tập trung
const handleError = (res, error) => {
  const status = error.status || 500;
  const message = error.message || "Lỗi server";
  res.status(status).json({ message, error: error.toString() });
};

exports.createRoom = async (req, res) => {
  try {
    const newRoom = await RoomService.createRoom(req.body);
    res.status(201).json({
      message: "Tạo phòng thành công",
      data: newRoom,
    });
  } catch (error) {
    handleError(res, error);
  }
};

exports.getRooms = async (req, res) => {
  try {
    const rooms = await RoomService.getAllRooms(req.query);
    res.status(200).json({
      count: rooms.length,
      data: rooms,
    });
  } catch (error) {
    handleError(res, error);
  }
};

exports.getRoomById = async (req, res) => {
  try {
    const room = await RoomService.getRoomDetail(req.params.id);
    res.status(200).json({ data: room });
  } catch (error) {
    handleError(res, error);
  }
};

exports.updateRoom = async (req, res) => {
  try {
    const updatedRoom = await RoomService.updateRoom(req.params.id, req.body);
    res.status(200).json({
      message: "Cập nhật phòng thành công",
      data: updatedRoom,
    });
  } catch (error) {
    handleError(res, error);
  }
};

exports.deleteRoom = async (req, res) => {
  try {
    await RoomService.deleteRoom(req.params.id);
    res.status(200).json({ message: "Đã xóa phòng vĩnh viễn" });
  } catch (error) {
    handleError(res, error);
  }
};

exports.toggleRoomStatus = async (req, res) => {
  try {
    const { isActive } = req.body;
    const room = await RoomService.toggleStatus(req.params.id, isActive);
    res.status(200).json({
      message: `Đã cập nhật trạng thái hoạt động thành: ${isActive}`,
      data: room,
    });
  } catch (error) {
    handleError(res, error);
  }
};