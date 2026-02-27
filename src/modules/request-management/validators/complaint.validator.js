/**
 * Complaint Request Validator
 * Validate request data from mobile frontend
 */

/**
 * Validate complaint creation request
 * @param {Object} data - Request body
 * @returns {Object} {valid: boolean, errors: Array}
 */
const validateCreateComplaint = (data) => {
  const errors = [];

  // Validate content
  if (!data.content) {
    errors.push("Content là bắt buộc");
  } else if (typeof data.content !== "string") {
    errors.push("Content phải là chuỗi ký tự");
  } else if (data.content.trim().length === 0) {
    errors.push("Content không được trống");
  } else if (data.content.length < 10) {
    errors.push("Content phải có ít nhất 10 ký tự");
  } else if (data.content.length > 2000) {
    errors.push("Content không được vượt quá 2000 ký tự");
  }

  // Validate category
  const validCategories = [
    "Tiếng ồn",
    "Vệ sinh",
    "An ninh",
    "Cơ sở vật chất",
    "Thái độ phục vụ",
    "Khác"
  ];

  if (!data.category) {
    errors.push("Category là bắt buộc");
  } else if (!validCategories.includes(data.category)) {
    errors.push(
      `Category phải là một trong: ${validCategories.join(", ")}`
    );
  }

  // Validate priority (optional, có default)
  if (data.priority) {
    const validPriorities = ["Low", "Medium", "High"];
    if (!validPriorities.includes(data.priority)) {
      errors.push(`Priority phải là một trong: ${validPriorities.join(", ")}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Validate complaint update request
 * @param {Object} data - Request body
 * @returns {Object} {valid: boolean, errors: Array}
 */
const validateUpdateComplaint = (data) => {
  const errors = [];

  // At least one field must be provided
  if (!data.content && !data.category && !data.priority) {
    errors.push("Ít nhất một trường phải được cập nhật (content, category, priority)");
    return { valid: false, errors };
  }

  // Validate content if provided
  if (data.content) {
    if (typeof data.content !== "string") {
      errors.push("Content phải là chuỗi ký tự");
    } else if (data.content.trim().length === 0) {
      errors.push("Content không được trống");
    } else if (data.content.length < 10) {
      errors.push("Content phải có ít nhất 10 ký tự");
    } else if (data.content.length > 2000) {
      errors.push("Content không được vượt quá 2000 ký tự");
    }
  }

  // Validate category if provided
  if (data.category) {
    const validCategories = [
      "Tiếng ồn",
      "Vệ sinh",
      "An niên",
      "Cơ sở vật chất",
      "Thái độ phục vụ",
      "Khác"
    ];

    if (!validCategories.includes(data.category)) {
      errors.push(
        `Category phải là một trong: ${validCategories.join(", ")}`
      );
    }
  }

  // Validate priority if provided
  if (data.priority) {
    const validPriorities = ["Low", "Medium", "High"];
    if (!validPriorities.includes(data.priority)) {
      errors.push(`Priority phải là một trong: ${validPriorities.join(", ")}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Validate complaint status update
 * @param {Object} data - {status, response}
 * @returns {Object} {valid: boolean, errors: Array}
 */
const validateUpdateStatus = (data) => {
  const errors = [];

  if (!data.status) {
    errors.push("Status là bắt buộc");
  } else {
    const validStatuses = ["Pending", "Processing", "Done"];
    if (!validStatuses.includes(data.status)) {
      errors.push(`Status phải là một trong: ${validStatuses.join(", ")}`);
    }
  }

  // Response là tùy chọn; nếu có thì validate format
  if (data.response) {
    if (typeof data.response !== "string") {
      errors.push("Response phải là chuỗi ký tự");
    } else if (data.response.trim().length === 0) {
      errors.push("Response không được trống");
    } else if (data.response.length < 5) {
      errors.push("Response phải có ít nhất 5 ký tự");
    } else if (data.response.length > 2000) {
      errors.push("Response không được vượt quá 2000 ký tự");
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Middleware to validate create complaint request
 */
const validateCreateComplaintMiddleware = (req, res, next) => {
  const validation = validateCreateComplaint(req.body);

  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: validation.errors
    });
  }

  next();
};

/**
 * Middleware to validate update complaint request
 */
const validateUpdateComplaintMiddleware = (req, res, next) => {
  const validation = validateUpdateComplaint(req.body);

  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: validation.errors
    });
  }

  next();
};

/**
 * Middleware to validate status update request
 */
const validateUpdateStatusMiddleware = (req, res, next) => {
  const validation = validateUpdateStatus(req.body);

  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: validation.errors
    });
  }

  next();
};

module.exports = {
  validateCreateComplaint,
  validateUpdateComplaint,
  validateUpdateStatus,
  validateCreateComplaintMiddleware,
  validateUpdateComplaintMiddleware,
  validateUpdateStatusMiddleware
};
