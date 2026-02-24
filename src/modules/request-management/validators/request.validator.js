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
  } else if (data.description.length > 2000) {
    errors.push("Mô tả không được vượt quá 2000 ký tự");
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

module.exports = {
  validateCreateRepairRequest,
  validateCreateRepairRequestMiddleware,
};
