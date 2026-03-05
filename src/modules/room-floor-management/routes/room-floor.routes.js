const express = require("express");
const router = express.Router();
const uploadImg = require("../middlewares/uploadimg");
const uploadExcel = require("../middlewares/uploadexcel");
const { authenticate, authorize, isTenant } = require("../../authentication/middlewares/index");
// Import Controllers
const roomController = require("../controllers/room.controller");
const floorController = require("../controllers/floor.controller");
const roomTypeController = require("../controllers/roomtype.controller");
const roomDeviceController = require("../controllers/roomdevice.controller");

// ==================================================================
// 1. CÁC ROUTE ĐẶC BIỆT CỦA ROOM (BẮT BUỘC PHẢI ĐỂ TRÊN CÙNG)
// ==================================================================
// Vì App.js dùng "/", nên ở đây ta phải viết rõ là "/room/..."

// Tải mẫu Excel (GET /room/template)
// [QUAN TRỌNG] Phải đặt dòng này TRƯỚC dòng /room/:id
router.get("/excel/template", roomController.downloadTemplate);

// Nhập file Excel (POST /room/import)
// [QUAN TRỌNG] Phải đặt dòng này TRƯỚC dòng /room/:id
router.post(
  "/excel/import",
  uploadExcel.single("file"),
  roomController.importRooms,
);

// View My Room - Xem thông tin phòng của tôi (Tenant)
// [QUAN TRỌNG] Phải đặt dòng này TRƯỚC dòng /room/:id
router.get("/room/my-room", authenticate, roomController.getMyRoom);

// ==================================================================
// 2. CÁC ROUTE DANH SÁCH & TẠO MỚI (KHÔNG CÓ ID)
// ==================================================================

// --- Room ---
router.get("/rooms", roomController.getRooms); // GET /rooms
router.post("/rooms", roomController.createRoom); // POST /rooms

// --- Floor ---
router.get("/floors", floorController.getFloors);
router.post("/floors", floorController.createFloor);

// --- RoomType ---
router.get("/roomtypes", roomTypeController.getRoomTypes);
router.post(
  "/roomtypes",
  uploadImg.array("images", 7),
  roomTypeController.createRoomType,
);

// ==================================================================
// 3. CÁC ROUTE CÓ THAM SỐ :ID (BẮT BUỘC PHẢI ĐỂ CUỐI CÙNG)
// ==================================================================
// Tại sao phải để cuối?
// Vì nếu để lên đầu, nó sẽ ăn mất chữ "template" hoặc "import" và coi đó là ID.

// --- Room Operations by ID ---
router.get("/rooms/:id", roomController.getRoomById); // GET /rooms/:id
router.put("/rooms/:id", roomController.updateRoom); // PUT /rooms/:id
router.delete("/rooms/:id", roomController.deleteRoom); // DELETE /rooms/:id
router.patch("/rooms/:id/toggle", roomController.toggleRoomStatus);

// --- Floor Operations by ID ---
router.get("/floors/:id", floorController.getFloorById);
router.put("/floors/:id", floorController.updateFloor);
router.delete("/floors/:id", floorController.deleteFloor);

// --- RoomType Operations by ID ---
router.get("/roomtypes/:id", roomTypeController.getRoomTypeById);
router.put(
  "/roomtypes/:id",
  uploadImg.array("images", 7),
  roomTypeController.updateRoomType,
);
router.delete("/roomtypes/:id", roomTypeController.deleteRoomType);

// ==================================================================
// 4. ROOM DEVICE ROUTES (Thiết bị theo loại phòng) - Owner only
// ==================================================================
// Tenant xem thiết bị phòng đang thuê: GET /roomdevices/my-room
// [QUAN TRỌNG] Phải đặt TRƯỚC /roomdevices/:id
router.get("/roomdevices/my-room", authenticate, isTenant, roomDeviceController.getMyRoomDevices);

// Lấy danh sách thiết bị theo loại phòng: GET /roomdevices?roomTypeId=xxx
router.get("/roomdevices", authenticate, authorize("owner"), roomDeviceController.getByRoomType);

// Dropdown chọn loại phòng khi thêm thiết bị: GET /roomdevices/roomtypes-select
// [QUAN TRỌNG] Phải đặt TRƯỚC /roomdevices/:id
router.get("/roomdevices/roomtypes-select", authenticate, authorize("owner"), roomDeviceController.getRoomTypesForSelect);

// Thêm thiết bị vào loại phòng: POST /roomdevices
router.post("/roomdevices", authenticate, authorize("owner"), roomDeviceController.create);

// Chi tiết + Sửa + Xóa theo id (phải đặt sau /roomdevices)
router.get("/roomdevices/:id", authenticate, authorize("owner"), roomDeviceController.getById);
router.put("/roomdevices/:id", authenticate, authorize("owner"), roomDeviceController.update);
router.delete("/roomdevices/:id", authenticate, authorize("owner"), roomDeviceController.remove);

module.exports = router;
