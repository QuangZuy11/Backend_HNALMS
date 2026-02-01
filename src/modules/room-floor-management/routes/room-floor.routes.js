const express = require("express");
const roomController = require("../controllers/room.controller");
const floorController = require("../controllers/floor.controller");
const roomTypeController = require("../controllers/roomtype.controller");
const router = express.Router();
const upload = require('../middlewares/upload');

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
// CREATE: upload.array('images', 10) -> Cho phép upload tối đa 10 ảnh, field name là 'images'
router.post('/roomtypes', upload.array('images', 10), roomTypeController.createRoomType);
// UPDATE: Cũng cần upload middleware để thêm ảnh mới
router.put('/roomtypes/:id', upload.array('images', 10), roomTypeController.updateRoomType);
router.delete("/roomtypes/:id", roomTypeController.deleteRoomType);

// POST /api/rooms - Tạo phòng mới (Chỉ Owner/Admin)
router.post("/room", roomController.createRoom);

// GET /api/rooms - Lấy danh sách (Có thể lọc theo ?floorId=...&status=...)
router.get("/room", roomController.getRooms);

// GET /api/rooms/:id - Lấy chi tiết
router.get("/room/:id", roomController.getRoomById);

// PUT /api/rooms/:id - Cập nhật thông tin (Có check Occupied)
router.put("/room/:id", roomController.updateRoom);

// DELETE /api/rooms/:id - Xóa phòng (Có check Occupied)
router.delete("/room/:id", roomController.deleteRoom);

// PATCH /api/rooms/:id/toggle - Bật/Tắt hoạt động (Soft Delete)
router.patch("/room/:id/toggle", roomController.toggleRoomStatus);

// // Route tải mẫu
// router.get('/template', roomController.downloadTemplate);

// // Route import (key file là 'file')
// router.post('/import', upload.single('file'), roomController.importRooms);

module.exports = router;