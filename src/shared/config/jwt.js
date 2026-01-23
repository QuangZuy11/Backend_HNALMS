const jwt = require("jsonwebtoken");

// JWT Configuration
const JWT_CONFIG = {
  secret: process.env.JWT_SECRET || "your_secret_key",
  expiresIn: "1d", // Token expires in 1 day
  refreshExpiresIn: "7d" // Refresh token expires in 7 days
};

/**
 * Generate JWT access token
 * @param {Object} payload - Data to encode in token (userId, role, etc.)
 * @returns {string} JWT token
 */
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_CONFIG.secret, {
    expiresIn: JWT_CONFIG.expiresIn
  });
};

/**
 * Generate JWT refresh token
 * @param {Object} payload - Data to encode in token
 * @returns {string} JWT refresh token
 */
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, JWT_CONFIG.secret, {
    expiresIn: JWT_CONFIG.refreshExpiresIn
  });
};

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_CONFIG.secret);
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
};

/**
 * Decode JWT token without verification
 * @param {string} token - JWT token to decode
 * @returns {Object} Decoded token payload
 */
const decodeToken = (token) => {
  return jwt.decode(token);
};

module.exports = {
  JWT_CONFIG,
  generateToken,
  generateRefreshToken,
  verifyToken,
  decodeToken
};
