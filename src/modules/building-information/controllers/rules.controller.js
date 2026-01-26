/**
 * Controller xử lý các request HTTP liên quan đến nội quy tòa nhà
 * Nhận request từ router, gọi service xử lý và trả về response
 */
const buildingService = require("../services/building.service");
const {
  successResponse,
  errorResponse,
} = require("../../../shared/utils/response");

/**
 * Lấy nội quy đang hoạt động (cho người dùng công khai)
 * Route: GET /api/buildings/rules/active
 * Không yêu cầu xác thực
 */
const getActiveRules = async (req, res) => {
  try {
    const rules = await buildingService.getActiveRules();

    if (!rules) {
      return errorResponse(res, "No active building rules found", 404);
    }

    return successResponse(res, rules, "Building rules retrieved successfully");
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Lấy tất cả nội quy (cho quản trị viên/quản lý)
 * Route: GET /api/buildings/rules
 * Yêu cầu: Admin hoặc Manager
 */
const getAllRules = async (req, res) => {
  try {
    const rules = await buildingService.getAllRules();

    return successResponse(
      res,
      rules,
      "All building rules retrieved successfully",
    );
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Lấy nội quy theo ID
 * Route: GET /api/buildings/rules/:id
 * Yêu cầu: Admin hoặc Manager
 */
const getRuleById = async (req, res) => {
  try {
    const { id } = req.params;
    const rule = await buildingService.getRuleById(id);

    return successResponse(res, rule, "Building rule retrieved successfully");
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Tạo nội quy mới
 * Route: POST /api/buildings/rules
 * Yêu cầu: Admin hoặc Manager
 */
const createRules = async (req, res) => {
  try {
    const rulesData = req.body;
    const newRules = await buildingService.createRules(rulesData);

    return successResponse(
      res,
      newRules,
      "Building rules created successfully",
      201,
    );
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Cập nhật nội quy
 * Route: PUT /api/buildings/rules/:id
 * Yêu cầu: Admin hoặc Manager
 */
const updateRules = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updatedRules = await buildingService.updateRules(id, updateData);

    return successResponse(
      res,
      updatedRules,
      "Building rules updated successfully",
    );
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

/**
 * Xóa nội quy
 * Route: DELETE /api/buildings/rules/:id
 * Yêu cầu: Chỉ Admin
 */
const deleteRules = async (req, res) => {
  try {
    const { id } = req.params;
    await buildingService.deleteRules(id);

    return successResponse(res, null, "Building rules deleted successfully");
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

module.exports = {
  getActiveRules,
  getAllRules,
  getRuleById,
  createRules,
  updateRules,
  deleteRules,
};
