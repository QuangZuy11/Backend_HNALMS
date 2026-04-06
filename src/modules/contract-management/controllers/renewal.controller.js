const {
  checkAndSendRenewalNotifications,
  getRenewalPreviewForTenant,
  confirmContractRenewal,
  declineContractRenewal,
} = require("../services/contract-renewal.service");

exports.getRenewalPreview = async (req, res) => {
  try {
    const tenantId = req.user?.userId;
    if (!tenantId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const { contractId } = req.params;
    const data = await getRenewalPreviewForTenant(contractId, tenantId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Get Renewal Preview Error:", error);
    const msg = error.message || "";
    let status = 400;
    if (msg.includes("Không tìm thấy")) status = 404;
    else if (msg.includes("quyền")) status = 403;
    res.status(status).json({
      success: false,
      message: error.message || "Server Error",
    });
  }
};

exports.confirmRenewal = async (req, res) => {
  try {
    const tenantId = req.user?.userId;
    if (!tenantId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const { contractId, extensionMonths } = req.body;
    if (!contractId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu contractId",
      });
    }
    const result = await confirmContractRenewal(contractId, tenantId, extensionMonths);
    res.status(200).json({
      success: true,
      message: "Gia hạn hợp đồng thành công.",
      data: {
        contractId: result.contract._id,
        newEndDate: result.newEndDate,
        extensionMonths: result.extensionMonths,
      },
    });
  } catch (error) {
    console.error("Confirm Renewal Error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Server Error",
    });
  }
};

exports.declineRenewal = async (req, res) => {
  try {
    const tenantId = req.user?.userId;
    if (!tenantId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const { contractId } = req.body;
    if (!contractId) {
      return res.status(400).json({
        success: false,
        message: "Thiếu contractId",
      });
    }
    const result = await declineContractRenewal(contractId, tenantId);
    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        contractId: result.contract._id,
        status: result.contract.status,
        renewalDeclined: result.contract.renewalDeclined,
      },
    });
  } catch (error) {
    console.error("Decline Renewal Error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Server Error",
    });
  }
};

// Test: Gửi thông báo gia hạn hợp đồng thủ công
exports.sendRenewalNotifications = async (req, res) => {
  try {
    console.log("[API] Gọi api gửi notification gia hạn hợp đồng...");
    await checkAndSendRenewalNotifications();
    res.status(200).json({
      success: true,
      message: "Đã chạy kiểm tra và gửi thông báo gia hạn hợp đồng",
    });
  } catch (error) {
    console.error("Send Renewal Notifications Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};
