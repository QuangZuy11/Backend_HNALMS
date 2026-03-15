/**
 * Service xử lý logic nghiệp vụ cho nội quy tòa nhà
 * Bao gồm các thao tác CRUD với database
 */
const BuildingRules = require("../models/building-rules.model");

/**
 * Lấy nội quy đang hoạt động (hiển thị công khai)
 * @returns {Object} Dữ liệu nội quy đang active
 */
const getActiveRules = async () => {
  try {
    const rules = await BuildingRules.findOne({ status: "active" })
      .sort({ createdAt: -1 })
      .lean();

    return rules;
  } catch (error) {
    throw new Error(`Error fetching building rules: ${error.message}`);
  }
};

/**
 * Lấy tất cả nội quy (dành cho quản trị viên)
 * @returns {Array} Danh sách tất cả nội quy
 */
const getAllRules = async () => {
  try {
    const rules = await BuildingRules.find().sort({ createdAt: -1 }).lean();

    return rules;
  } catch (error) {
    throw new Error(`Error fetching all building rules: ${error.message}`);
  }
};

/**
 * Lấy nội quy theo ID
 * @param {string} id - ID của nội quy
 * @returns {Object} Dữ liệu nội quy
 */
const getRuleById = async (id) => {
  try {
    const rule = await BuildingRules.collection.findOne({ _id: id });

    if (!rule) {
      throw new Error("Building rule not found");
    }

    return rule;
  } catch (error) {
    throw new Error(`Error fetching building rule: ${error.message}`);
  }
};

/**
 * Tạo nội quy mới
 * @param {Object} rulesData - Dữ liệu nội quy cần tạo
 * @returns {Object} Nội quy vừa tạo
 */
const createRules = async (rulesData) => {
  try {
    // Kiểm tra đã có document nào tồn tại chưa
    const existing = await BuildingRules.findOne().lean();

    if (existing) {
      // Nếu đã có thì thêm (push) vào mảng cũ
      const pushData = {};
      if (rulesData.categories && rulesData.categories.length > 0) {
        pushData.categories = {
          $each: rulesData.categories.map(({ _id, ...cat }) => cat),
        };
      }
      if (rulesData.guidelines && rulesData.guidelines.length > 0) {
        pushData.guidelines = {
          $each: rulesData.guidelines.map(({ _id, ...g }) => g),
        };
      }

      const updateOps = {};
      if (Object.keys(pushData).length > 0) {
        updateOps.$push = pushData;
      }
      if (rulesData.status) {
        updateOps.$set = { status: rulesData.status };
      }

      // Dùng native collection để tránh lỗi cast _id
      const result = await BuildingRules.collection.findOneAndUpdate(
        { _id: existing._id },
        updateOps,
        { returnDocument: "after" },
      );
      return result;
    }

    // Nếu chưa có thì tạo mới
    const newRules = new BuildingRules(rulesData);
    await newRules.save();
    return newRules;
  } catch (error) {
    throw new Error(`Error creating building rules: ${error.message}`);
  }
};

/**
 * Cập nhật nội quy
 * @param {string} id - ID của nội quy cần cập nhật
 * @param {Object} updateData - Dữ liệu cần cập nhật
 * @returns {Object} Nội quy sau khi cập nhật
 */
const updateRules = async (id, updateData) => {
  try {
    const { _id, __v, createdAt, updatedAt, ...safeData } = updateData;

    // Strip _id from subdocuments to avoid conflicts
    if (safeData.categories) {
      safeData.categories = safeData.categories.map(({ _id, ...cat }) => cat);
    }
    if (safeData.guidelines) {
      safeData.guidelines = safeData.guidelines.map(({ _id, ...g }) => g);
    }

    const updatedRules = await BuildingRules.collection.findOneAndUpdate(
      { _id: id },
      { $set: safeData },
      { returnDocument: "after" },
    );

    if (!updatedRules) {
      throw new Error("Building rule not found");
    }

    return updatedRules;
  } catch (error) {
    throw new Error(`Error updating building rules: ${error.message}`);
  }
};

/**
 * Xóa nội quy
 * @param {string} id - ID của nội quy cần xóa
 * @returns {Object} Nội quy đã xóa
 */
const deleteRules = async (id) => {
  try {
    const deletedRules = await BuildingRules.collection.findOneAndDelete({
      _id: id,
    });

    if (!deletedRules) {
      throw new Error("Building rule not found");
    }

    return deletedRules;
  } catch (error) {
    throw new Error(`Error deleting building rules: ${error.message}`);
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
