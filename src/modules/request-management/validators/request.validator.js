/**
 * Request Validator
 * Validate repair/maintenance request data
 */

/**
 * Validate repair request creation
 * @param {Object} data - Request body
 * @returns {Object} {valid: boolean, errors: Array}
 */
const validateCreateRepairRequest = (data) => {
  const errors = [];

  // Validate roomId
  if (!data.roomId) {
    errors.push("Room ID là bắt buộc");
  } else if (typeof data.roomId !== "string") {
    errors.push("Room ID phải là chuỗi ký tự");
  } else if (!/^[a-fA-F0-9]{24}$/.test(data.roomId)) {
    errors.push("Room ID không hợp lệ");
  }

  // Validate devicesId
  if (!data.devicesId) {
    errors.push("Device ID là bắt buộc");
  } else if (typeof data.devicesId !== "string") {
    errors.push("Device ID phải là chuỗi ký tự");
  } else if (!/^[a-fA-F0-9]{24}$/.test(data.devicesId)) {
    errors.push("Device ID không hợp lệ");
  }

  // Validate type
  const validTypes = ["Sửa chữa", "Bảo trì"];
  if (!data.type) {
    errors.push("Loại yêu cầu là bắt buộc");
  } else if (!validTypes.includes(data.type)) {
    errors.push(`Loại yêu cầu phải là một trong: ${validTypes.join(", ")}`);
  }

  // Validate description
  if (!data.description) {
    errors.push("Mô tả là bắt buộc");
  } else if (typeof data.description !== "string") {
    errors.push("Mô tả phải là chuỗi ký tự");
  } else if (data.description.trim().length === 0) {
    errors.push("Mô tả không được trống");
  } else if (data.description.length < 10) {
    errors.push("Mô tả phải có ít nhất 10 ký tự");
  } else if (data.description.length > 1000) {
    errors.push("Mô tả không được vượt quá 1000 ký tự");
  }

  // Validate images (optional) - Image URLs from frontend
  if (data.images) {
    if (!Array.isArray(data.images)) {
      errors.push("Images phải là mảng");
    } else if (data.images.length > 10) {
      errors.push("Không được tải lên quá 10 hình ảnh");
    } else if (data.images.length > 0) {
      // Validate each URL
      const invalidUrls = data.images.filter(url => {
        if (typeof url !== 'string') return true;
        return !url.startsWith('http://') && !url.startsWith('https://');
      });
      
      if (invalidUrls.length > 0) {
        errors.push("Một số URL hình ảnh không hợp lệ");
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Validate repair request update (tenant)
 * @param {Object} data - Request body
 * @returns {Object} {valid: boolean, errors: Array}
 */
const validateUpdateRepairRequest = (data) => {
  const errors = [];

  if (!data.type && !data.description && !data.images && !data.devicesId && !data.roomId) {
    errors.push("Ít nhất một trường phải được cập nhật (roomId, type, devicesId, description, images)");
    return { valid: false, errors };
  }

  if (data.roomId !== undefined) {
    if (typeof data.roomId !== "string") {
      errors.push("Room ID phải là chuỗi ký tự");
    } else if (!/^[a-fA-F0-9]{24}$/.test(data.roomId)) {
      errors.push("Room ID không hợp lệ");
    }
  }

  if (data.devicesId !== undefined) {
    if (typeof data.devicesId !== "string") {
      errors.push("Device ID phải là chuỗi ký tự");
    } else if (!/^[a-fA-F0-9]{24}$/.test(data.devicesId)) {
      errors.push("Device ID không hợp lệ");
    }
  }

  if (data.type !== undefined) {
    const validTypes = ["Sửa chữa", "Bảo trì"];
    if (!validTypes.includes(data.type)) {
      errors.push(`Loại yêu cầu phải là một trong: ${validTypes.join(", ")}`);
    }
  }

  if (data.description !== undefined) {
    if (typeof data.description !== "string" || data.description.trim().length === 0) {
      errors.push("Mô tả không được trống");
    } else if (data.description.length < 10) {
      errors.push("Mô tả phải có ít nhất 10 ký tự");
    } else if (data.description.length > 1000) {
      errors.push("Mô tả không được vượt quá 1000 ký tự");
    }
  }

  if (data.images !== undefined) {
    if (!Array.isArray(data.images)) {
      errors.push("Images phải là mảng");
    } else if (data.images.length > 10) {
      errors.push("Không được tải lên quá 10 hình ảnh");
    } else if (data.images.length > 0) {
      const invalidUrls = data.images.filter(
        (url) => typeof url !== "string" || (!url.startsWith("http://") && !url.startsWith("https://"))
      );
      if (invalidUrls.length > 0) errors.push("Một số URL hình ảnh không hợp lệ");
    }
  }

  return { valid: errors.length === 0, errors };
};

/**
 * Middleware validator cho việc tạo yêu cầu sửa chữa
 */
const validateCreateRepairRequestMiddleware = (req, res, next) => {
  const validation = validateCreateRepairRequest(req.body);

  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: validation.errors,
    });
  }

  next();
};

const validateUpdateRepairRequestMiddleware = (req, res, next) => {
  const validation = validateUpdateRepairRequest(req.body);
  if (!validation.valid) {
    return res.status(400).json({ success: false, message: "Validation failed", errors: validation.errors });
  }
  next();
};

/**
 * Validate repair status update (manager)
 * @param {Object} data - Request body
 * @returns {Object} {valid: boolean, errors: Array}
 */
const validateUpdateRepairStatus = (data) => {
  const errors = [];
  const allowedStatus = ["Pending", "Processing", "Done", "Unpaid", "Paid"];

  if (!data.status) {
    errors.push("Thiếu trạng thái cần cập nhật");
  } else if (!allowedStatus.includes(data.status)) {
    errors.push("Trạng thái không hợp lệ");
  }

  if (data.paymentType === "REVENUE") {
    if (!data.invoiceTitle) errors.push("Tiêu đề hóa đơn là bắt buộc");
    if (data.invoiceTotalAmount === undefined || data.invoiceTotalAmount === null || data.invoiceTotalAmount === "") {
      errors.push("Tổng số tiền là bắt buộc");
    } else if (Number.isNaN(Number(data.invoiceTotalAmount)) || Number(data.invoiceTotalAmount) < 0) {
      errors.push("Tổng số tiền phải là số hợp lệ và lớn hơn hoặc bằng 0");
    }
  }

  return { valid: errors.length === 0, errors };
};

const validateUpdateRepairStatusMiddleware = (req, res, next) => {
  const validation = validateUpdateRepairStatus(req.body || {});
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: validation.errors,
    });
  }
  next();
};

module.exports = {
  validateCreateRepairRequest,
  validateCreateRepairRequestMiddleware,
  validateUpdateRepairRequest,
  validateUpdateRepairRequestMiddleware,
  validateUpdateRepairStatus,
  validateUpdateRepairStatusMiddleware,
};
