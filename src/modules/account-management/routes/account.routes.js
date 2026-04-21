const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../../authentication/middlewares");
const { validateCreateOwner, validateCreateManager } = require("../validators/account.validator");

const ownerController = require("../controllers/owner.controller");
const managerController = require("../controllers/manager.controller");
const tenantController = require("../controllers/tenant.controller");

// --- Owners (Admin only) ---
router.post(
  "/owners",
  authenticate,
  authorize("admin"),
  validateCreateOwner,
  ownerController.createOwner
);
router.get("/owners", authenticate, authorize("admin"), ownerController.getOwners);
router.get("/owners/:id", authenticate, authorize("admin"), ownerController.getOwnerById);
router.put("/owners/:id/disable", authenticate, authorize("admin"), ownerController.disableOwner);
router.put("/owners/:id/enable", authenticate, authorize("admin"), ownerController.enableOwner);

// --- Managers & Accountants (Owner, Admin) ---
router.post(
  "/managers",
  authenticate,
  authorize("owner"),
  validateCreateManager,
  managerController.createManagerOrAccountant
);
router.get("/managers", authenticate, authorize("owner", "admin"), managerController.getManagers);
router.get("/managers/:id", authenticate, authorize("owner", "admin"), managerController.getManagerById);
router.put("/managers/:id/disable", authenticate, authorize("owner"), managerController.disableManager);
router.put("/managers/:id/enable", authenticate, authorize("owner"), managerController.enableManager);
router.delete("/managers/:id", authenticate, authorize("owner", "admin"), managerController.deleteManager);

// --- Tenants (Manager, Owner) ---
router.get("/tenants", authenticate, authorize("manager", "owner"), tenantController.getTenants);
router.get("/tenants/:id", authenticate, authorize("manager", "owner"), tenantController.getTenantById);
router.put("/tenants/:id/disable", authenticate, authorize("manager"), tenantController.disableTenant);
router.put("/tenants/:id/enable", authenticate, authorize("manager"), tenantController.enableTenant);

module.exports = router;
