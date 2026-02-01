/**
 * Middleware exports
 * Tập trung export tất cả middleware để dễ import
 * 
 * Usage:
 * const { authenticate, authorize, isAdmin } = require('./middlewares');
 */

const { authenticate, optionalAuth } = require('./authenticate');
const { 
  authorize, 
  isAdmin, 
  isManagerOrAdmin, 
  isOwnerOrAdmin,
  isTenant,
  isResourceOwner,
  canCreateAccount
} = require('./authorize');

module.exports = {
  // Authentication
  authenticate,
  optionalAuth,
  
  // Authorization
  authorize,
  isAdmin,
  isManagerOrAdmin,
  isOwnerOrAdmin,
  isTenant,
  isResourceOwner,
  canCreateAccount
};
