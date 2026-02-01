const express = require("express");
const roomController = require("../controllers/room.controller");
const floorController = require("../controllers/floor.controller");
const roomTypeController = require("../controllers/roomtype.controller");
const router = express.Router();

// --- ROOM ROUTES (Cũ) ---
router.get("/rooms", roomController.getRooms);
router.get("/rooms/:id", roomController.getRoomById);

// --- FLOOR ROUTES (Mới thêm vào) ---

// Lấy danh sách tầng
router.get("/floors", floorController.getFloors);

// Lấy chi tiết 1 tầng
router.get("/floors/:id", floorController.getFloorById);

// Thêm tầng mới
router.post("/floors", floorController.createFloor);

// Sửa tầng (theo ID)
router.put("/floors/:id", floorController.updateFloor);

// Xóa tầng (theo ID)
router.delete("/floors/:id", floorController.deleteFloor);

router.get("/roomtypes", roomTypeController.getRoomTypes);
router.get("/roomtypes/:id", roomTypeController.getRoomTypeById);
router.post("/roomtypes", roomTypeController.createRoomType);
router.put("/roomtypes/:id", roomTypeController.updateRoomType);
router.delete("/roomtypes/:id", roomTypeController.deleteRoomType);


module.exports = router;