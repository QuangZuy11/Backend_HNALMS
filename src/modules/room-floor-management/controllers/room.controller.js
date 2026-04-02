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



const RoomService = require("../services/room.service");

// Helper function để xử lý lỗi tập trung
const handleError = (res, error) => {
  console.error("🔴 LỖI CHI TIẾT:", error);
  const status = error.status || 500;
  const message = error.message || "Lỗi server nội bộ";
  
  res.status(status).json({ 
    success: false,
    message: message,
    errorDetails: error 
  });
};

exports.createRoom = async (req, res) => {
  try {
    const newRoom = await RoomService.createRoom(req.body);
    res.status(201).json({ message: "Tạo phòng thành công", data: newRoom });
  } catch (error) { handleError(res, error); }
};

exports.getRooms = async (req, res) => {
  try {
    // Truyền role để service phân biệt guest vs owner/admin
    const filters = { ...req.query, _userRole: req.user?.role };
    const rooms = await RoomService.getAllRooms(filters);
    res.status(200).json({ count: rooms.length, data: rooms });
  } catch (error) { handleError(res, error); }
};

exports.getRoomById = async (req, res) => {
  try {
    const room = await RoomService.getRoomDetail(req.params.id);
    res.status(200).json({ data: room });
  } catch (error) { handleError(res, error); }
};

exports.updateRoom = async (req, res) => {
  try {
    const updatedRoom = await RoomService.updateRoom(req.params.id, req.body);
    res.status(200).json({ message: "Cập nhật phòng thành công", data: updatedRoom });
  } catch (error) { handleError(res, error); }
};

exports.deleteRoom = async (req, res) => {
  try {
    await RoomService.deleteRoom(req.params.id);
    res.status(200).json({ message: "Đã xóa phòng vĩnh viễn" });
  } catch (error) { handleError(res, error); }
};

exports.toggleRoomStatus = async (req, res) => {
  try {
    const { isActive } = req.body;
    const room = await RoomService.toggleStatus(req.params.id, isActive);
    res.status(200).json({ message: `Đã cập nhật trạng thái hoạt động thành: ${isActive}`, data: room });
  } catch (error) { handleError(res, error); }
};

// ==========================================
//          [EXCEL FEATURES]
// ==========================================

exports.downloadTemplate = async (req, res) => {
  try {
    const buffer = await RoomService.generateTemplateBuffer();
    res.setHeader('Content-Disposition', 'attachment; filename="Mau_Nhap_Phong.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) { handleError(res, error); }
};

// HÀM IMPORT ĐÃ ĐƯỢC LÀM MỚI ĐỂ BẮT LỖI TỐT HƠN
exports.importRooms = async (req, res) => {
  console.log("---------------- START IMPORT ----------------");
  try {
    // 1. Kiểm tra file từ Multer
    if (!req.file) {
      throw { status: 400, message: "Không tìm thấy file! Hãy chắc chắn Key gửi lên là 'file'." };
    }
    console.log("📂 Đã nhận file:", req.file.originalname, "| Size:", req.file.size);

    // 2. Gọi Service
    const result = await RoomService.importRoomsFromFile(req.file);

    res.status(200).json({ 
      success: true, 
      message: `Nhập thành công ${result.count} phòng!`, 
      data: result 
    });

  } catch (error) {
    console.error("🔥 LỖI GỐC (CONTROLLER):");
    console.error(error); 

    // Ép kiểu lỗi thành message string để tránh [object Object]
    const status = error.status || 500;
    const message = error.message || "Lỗi không xác định khi nhập file";
    const details = error.details || null; // Lấy danh sách lỗi chi tiết (nếu có)

    res.status(status).json({ 
      success: false,
      message: message,
      errors: details,      // Frontend sẽ hiển thị cái này nếu có
      debugStack: error.stack // Dùng để debug
    });
  }
};

// ==========================================
//        [TENANT - VIEW MY ROOM]
// ==========================================

exports.getMyRoom = async (req, res) => {
  try {
    console.log("🔍 getMyRoom - Full req.user:", JSON.stringify(req.user, null, 2));
    console.log("🔍 getMyRoom - req.headers:", req.headers.authorization);
    
    // Lấy tenantId từ req.user (được set bởi authenticate middleware)
    const tenantId = req.user?.userId || req.user?.id || req.user?._id;

    console.log("🔍 getMyRoom - tenantId extracted:", tenantId);

    if (!tenantId) {
      console.log("❌ getMyRoom - No tenantId found in req.user!");
      return res.status(401).json({
        success: false,
        message: "Unauthorized - Không tìm thấy thông tin người dùng",
        debug: { reqUser: req.user }
      });
    }

    console.log("✅ getMyRoom - Calling service with tenantId:", tenantId);
    const roomData = await RoomService.getMyRoom(tenantId);

    res.status(200).json({
      success: true,
      message: "Lấy thông tin phòng của tôi thành công",
      data: roomData
    });

  } catch (error) {
    handleError(res, error);
  }
};