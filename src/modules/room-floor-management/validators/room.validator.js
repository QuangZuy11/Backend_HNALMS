// Validate: area > 0, price > 0, status enum

const { body, validationResult } = require("express-validator");

// Validator cho getMyRoom
exports.validateGetMyRoom = [
  // Middleware sẽ check xem user có được authenticate không
  // Nếu không có req.user, middleware authenticate sẽ reject trước
];

// Middleware to handle validation errors
exports.handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation Error",
      errors: errors.array()
    });
  }
  next();
};
