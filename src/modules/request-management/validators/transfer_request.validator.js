/**
 * Transfer Request Validator
 * Validate room transfer request data
 */

const validateCreateTransferRequest = (data) => {
  const errors = [];

  // Validate roomId (optional) - phòng hiện tại
  if (data.roomId !== undefined) {
    if (data.roomId === null || data.roomId === "") {
      errors.push("Room ID không được rỗng");
    } else if (!/^[a-fA-F0-9]{24}$/.test(data.roomId)) {
      errors.push("Room ID (phòng hiện tại) không hợp lệ");
    }
  }

  // Validate targetRoomId
  if (!data.targetRoomId) {
    errors.push("Phòng muốn chuyển đến là bắt buộc (targetRoomId)");
  } else if (!/^[a-fA-F0-9]{24}$/.test(data.targetRoomId)) {
    errors.push("targetRoomId không hợp lệ");
  }

  // Validate transferDate
  if (!data.transferDate) {
    errors.push("Ngày chuyển phòng là bắt buộc (transferDate)");
  } else {
    const transferDate = new Date(data.transferDate);
    if (isNaN(transferDate.getTime())) {
      errors.push("Ngày chuyển phòng không hợp lệ");
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (transferDate < today) {
        errors.push("Ngày chuyển phòng không được là ngày trong quá khứ");
      }
    }
  }

  // Validate reason
  if (!data.reason) {
    errors.push("Lý do chuyển phòng là bắt buộc");
  } else if (typeof data.reason !== "string") {
    errors.push("Lý do phải là chuỗi ký tự");
  } else if (data.reason.trim().length === 0) {
    errors.push("Lý do không được trống");
  } else if (data.reason.trim().length < 10) {
    errors.push("Lý do phải có ít nhất 10 ký tự");
  } else if (data.reason.length > 1000) {
    errors.push("Lý do không được vượt quá 1000 ký tự");
  }

  return { valid: errors.length === 0, errors };
};

/**
 * Validate transfer request update
 * @param {Object} data - Request body
 * @returns {Object} {valid: boolean, errors: Array}
 */
const validateUpdateTransferRequest = (data) => {
  const errors = [];

  // At least one field must be present
  if (!data.roomId && !data.targetRoomId && !data.transferDate && !data.reason) {
    errors.push("Ít nhất một trường phải được cập nhật (roomId, targetRoomId, transferDate, reason)");
    return { valid: false, errors };
  }

  // Validate roomId (optional) - phòng hiện tại
  if (data.roomId !== undefined) {
    if (data.roomId === null || data.roomId === "") {
      errors.push("Room ID không được rỗng");
    } else if (!/^[a-fA-F0-9]{24}$/.test(data.roomId)) {
      errors.push("Room ID (phòng hiện tại) không hợp lệ");
    }
  }

  // Validate targetRoomId (optional)
  if (data.targetRoomId !== undefined) {
    if (data.targetRoomId === null || data.targetRoomId === "") {
      errors.push("Phòng muốn chuyển đến không được rỗng");
    } else if (!/^[a-fA-F0-9]{24}$/.test(data.targetRoomId)) {
      errors.push("targetRoomId không hợp lệ");
    }
  }

  // Validate transferDate (optional)
  if (data.transferDate !== undefined) {
    const transferDate = new Date(data.transferDate);
    if (isNaN(transferDate.getTime())) {
      errors.push("Ngày chuyển phòng không hợp lệ");
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (transferDate < today) {
        errors.push("Ngày chuyển phòng không được là ngày trong quá khứ");
      }
    }
  }

  // Validate reason (optional)
  if (data.reason !== undefined) {
    if (typeof data.reason !== "string") {
      errors.push("Lý do phải là chuỗi ký tự");
    } else if (data.reason.trim().length === 0) {
      errors.push("Lý do không được trống");
    } else if (data.reason.trim().length < 10) {
      errors.push("Lý do phải có ít nhất 10 ký tự");
    } else if (data.reason.length > 1000) {
      errors.push("Lý do không được vượt quá 1000 ký tự");
    }
  }

  return { valid: errors.length === 0, errors };
};

/**
 * Middleware validate tạo yêu cầu chuyển phòng
 */
const validateCreateTransferRequestMiddleware = (req, res, next) => {
  const { valid, errors } = validateCreateTransferRequest(req.body);
  if (!valid) {
    return res.status(400).json({
      success: false,
      message: "Dữ liệu không hợp lệ",
      errors,
    });
  }
  next();
};

/**
 * Middleware validate cập nhật yêu cầu chuyển phòng
 */
const validateUpdateTransferRequestMiddleware = (req, res, next) => {
  const { valid, errors } = validateUpdateTransferRequest(req.body);
  if (!valid) {
    return res.status(400).json({
      success: false,
      message: "Dữ liệu không hợp lệ",
      errors,
    });
  }
  next();
};

module.exports = {
  validateCreateTransferRequest,
  validateCreateTransferRequestMiddleware,
  validateUpdateTransferRequest,
  validateUpdateTransferRequestMiddleware,
};
