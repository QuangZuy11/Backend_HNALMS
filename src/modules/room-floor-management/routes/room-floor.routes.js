const express = require("express");
const router = express.Router();
const uploadImg = require('../middlewares/uploadimg');
const uploadExcel = require('../middlewares/uploadexcel');
const { authenticate } = require("../../authentication/middlewares/index");
// Import Controllers
const roomController = require("../controllers/room.controller");
const floorController = require("../controllers/floor.controller");
const roomTypeController = require("../controllers/roomtype.controller");

// ==================================================================
// 1. CÁC ROUTE ĐẶC BIỆT CỦA ROOM (BẮT BUỘC PHẢI ĐỂ TRÊN CÙNG)
// ==================================================================
// Vì App.js dùng "/", nên ở đây ta phải viết rõ là "/room/..."

// Tải mẫu Excel (GET /room/template)
// [QUAN TRỌNG] Phải đặt dòng này TRƯỚC dòng /room/:id
router.get('/excel/template', roomController.downloadTemplate);

// Nhập file Excel (POST /room/import)
// [QUAN TRỌNG] Phải đặt dòng này TRƯỚC dòng /room/:id
router.post('/excel/import', uploadExcel.single('file'), roomController.importRooms);

// View My Room - Xem thông tin phòng của tôi (Tenant)
// [QUAN TRỌNG] Phải đặt dòng này TRƯỚC dòng /room/:id
router.get('/room/my-room', authenticate, roomController.getMyRoom);


// ==================================================================
// 2. CÁC ROUTE DANH SÁCH & TẠO MỚI (KHÔNG CÓ ID)
// ==================================================================

// --- Room ---
router.get("/room", roomController.getRooms);      // GET /room
router.post("/room", roomController.createRoom);   // POST /room

// --- Floor ---
router.get("/floors", floorController.getFloors);
router.post("/floors", floorController.createFloor);

// --- RoomType ---
router.get("/roomtypes", roomTypeController.getRoomTypes);
router.post('/roomtypes', uploadImg.array('images', 10), roomTypeController.createRoomType);


// ==================================================================
// 3. CÁC ROUTE CÓ THAM SỐ :ID (BẮT BUỘC PHẢI ĐỂ CUỐI CÙNG)
// ==================================================================
// Tại sao phải để cuối? 
// Vì nếu để lên đầu, nó sẽ ăn mất chữ "template" hoặc "import" và coi đó là ID.

// --- Room Operations by ID ---
router.get("/room/:id", roomController.getRoomById);       // GET /room/:id
router.put("/room/:id", roomController.updateRoom);        // PUT /room/:id
router.delete("/room/:id", roomController.deleteRoom);     // DELETE /room/:id
router.patch("/room/:id/toggle", roomController.toggleRoomStatus);

// --- Floor Operations by ID ---
router.get("/floors/:id", floorController.getFloorById);
router.put("/floors/:id", floorController.updateFloor);
router.delete("/floors/:id", floorController.deleteFloor);

// --- RoomType Operations by ID ---
router.get("/roomtypes/:id", roomTypeController.getRoomTypeById);
router.put('/roomtypes/:id', uploadImg.array('images', 10), roomTypeController.updateRoomType);
router.delete("/roomtypes/:id", roomTypeController.deleteRoomType);

module.exports = router;