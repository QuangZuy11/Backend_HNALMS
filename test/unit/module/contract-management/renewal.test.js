/**
 * renewal.test.js - UNIT TEST CHO CONTRACT RENEWAL API
 *
 * Kiểm tra các endpoint:
 * 1. GET /renewals/preview/:contractId - Xem trước gia hạn hợp đồng
 * 2. POST /renewals/confirm - Xác nhận gia hạn hợp đồng
 * 3. POST /renewals/decline - Từ chối gia hạn hợp đồng
 * 4. POST /renewals/send-notifications - Gửi notification gia hạn (admin/test)
 */

// ────────────────────────────────────────────────────────────────────────────────
// MOCKS
// ────────────────────────────────────────────────────────────────────────────────

jest.mock("../../../../src/modules/contract-management/models/contract.model");
jest.mock("../../../../src/modules/notification-management/models/notification.model");
jest.mock(
  "../../../../src/modules/contract-management/models/contract-notification-log.model"
);
jest.mock("../../../../src/modules/authentication/models/user.model");
jest.mock("../../../../src/modules/room-floor-management/models/pricehistory.model");
jest.mock(
  "../../../../src/modules/contract-management/models/moveout_request.model"
);

const renewalController = require("../../../../src/modules/contract-management/controllers/renewal.controller");
const {
  checkAndSendRenewalNotifications,
  getRenewalPreviewForTenant,
  confirmContractRenewal,
  declineContractRenewal,
} = require("../../../../src/modules/contract-management/services/contract-renewal.service");

// Mock service (vì service gọi DB)
jest.mock(
  "../../../../src/modules/contract-management/services/contract-renewal.service"
);

// ────────────────────────────────────────────────────────────────────────────────
// HELPER: Tạo req/res/next giả lập
// ────────────────────────────────────────────────────────────────────────────────

const createMockReqRes = (body = {}, params = {}, user) => {
  const req = {
    body,
    params,
    user: user === undefined ? { userId: "tenant-123" } : user,
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const next = jest.fn();
  return { req, res, next };
};

// ────────────────────────────────────────────────────────────────────────────────
// TEST 1: getRenewalPreview
// ────────────────────────────────────────────────────────────────────────────────

describe("renewalController.getRenewalPreview", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 when user is not authenticated (utr001)", async () => {
    const { req, res } = createMockReqRes({ contractId: "contract-1" }, {}, null);

    await renewalController.getRenewalPreview(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Unauthorized",
    });
  });

  test("returns 404 when contract is not found (utr002)", async () => {
    const { req, res } = createMockReqRes(
      {},
      { contractId: "not-exists" },
      { userId: "tenant-123" }
    );

    getRenewalPreviewForTenant.mockRejectedValue(
      new Error("Không tìm thấy hợp đồng")
    );

    await renewalController.getRenewalPreview(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Không tìm thấy hợp đồng",
    });
  });

  test("returns 403 when user doesn't have permission (utr003)", async () => {
    const { req, res } = createMockReqRes(
      {},
      { contractId: "contract-1" },
      { userId: "tenant-456" }
    );

    getRenewalPreviewForTenant.mockRejectedValue(
      new Error("Bạn không có quyền truy cập hợp đồng này")
    );

    await renewalController.getRenewalPreview(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Bạn không có quyền truy cập hợp đồng này",
    });
  });

  test("returns renewal preview data when contract is found (utr004)", async () => {
    const { req, res } = createMockReqRes(
      {},
      { contractId: "contract-1" },
      { userId: "tenant-123" }
    );

    const mockPreviewData = {
      contractId: "contract-1",
      contractCode: "HN/Phòng 308/2026/HDSV/336",
      currentRoomPrice: 2000000,
      newRoomPrice: null,
      daysLeft: 15,
      canRenew: true,
      hasAction: false,
      renewalStatus: null,
      isGapContract: false,
      maxExtensionMonths: 24,
      minExtensionMonths: 1,
    };

    getRenewalPreviewForTenant.mockResolvedValue(mockPreviewData);

    await renewalController.getRenewalPreview(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockPreviewData,
      message: "Bạn có thể gia hạn hoặc từ chối gia hạn.",
    });
  });

  test("returns message when contract already renewed (utr005)", async () => {
    const { req, res } = createMockReqRes(
      {},
      { contractId: "contract-1" },
      { userId: "tenant-123" }
    );

    const mockPreviewData = {
      contractId: "contract-1",
      renewalStatus: "renewed",
      hasAction: true,
      canRenew: false,
    };

    getRenewalPreviewForTenant.mockResolvedValue(mockPreviewData);

    await renewalController.getRenewalPreview(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockPreviewData,
      message: "Hợp đồng đã có quyết định: renewed",
    });
  });

  test("returns message when contract already declined (utr006)", async () => {
    const { req, res } = createMockReqRes(
      {},
      { contractId: "contract-1" },
      { userId: "tenant-123" }
    );

    const mockPreviewData = {
      contractId: "contract-1",
      renewalStatus: "declined",
      hasAction: true,
      canRenew: false,
    };

    getRenewalPreviewForTenant.mockResolvedValue(mockPreviewData);

    await renewalController.getRenewalPreview(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockPreviewData,
      message: "Hợp đồng đã có quyết định: declined",
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// TEST 2: confirmRenewal
// ────────────────────────────────────────────────────────────────────────────────

describe("renewalController.confirmRenewal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 when user is not authenticated (utr007)", async () => {
    const { req, res } = createMockReqRes(
      { contractId: "contract-1", extensionMonths: 12 },
      {},
      null
    );

    await renewalController.confirmRenewal(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Unauthorized",
    });
  });

  test("returns 400 when contractId is missing (utr008)", async () => {
    const { req, res } = createMockReqRes(
      { extensionMonths: 12 },
      {},
      { userId: "tenant-123" }
    );

    await renewalController.confirmRenewal(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Thiếu contractId",
    });
  });

  test("returns 400 when confirmation fails due to business logic (utr009)", async () => {
    const { req, res } = createMockReqRes(
      { contractId: "contract-1", extensionMonths: 12 },
      {},
      { userId: "tenant-123" }
    );

    confirmContractRenewal.mockRejectedValue(
      new Error("Hợp đồng không thể gia hạn (hết cửa sổ)")
    );

    await renewalController.confirmRenewal(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Hợp đồng không thể gia hạn (hết cửa sổ)",
    });
  });

  test("successfully confirms renewal (utr010)", async () => {
    const { req, res } = createMockReqRes(
      { contractId: "contract-1", extensionMonths: 12 },
      {},
      { userId: "tenant-123" }
    );

    const mockResult = {
      contract: {
        _id: "contract-1",
      },
      newEndDate: "2027-06-17",
      extensionMonths: 12,
    };

    confirmContractRenewal.mockResolvedValue(mockResult);

    await renewalController.confirmRenewal(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Gia hạn hợp đồng thành công.",
      data: {
        contractId: "contract-1",
        newEndDate: "2027-06-17",
        extensionMonths: 12,
      },
    });
  });

  test("confirms renewal with custom extension months (utr011)", async () => {
    const { req, res } = createMockReqRes(
      { contractId: "contract-1", extensionMonths: 6 },
      {},
      { userId: "tenant-123" }
    );

    const mockResult = {
      contract: {
        _id: "contract-1",
      },
      newEndDate: "2027-01-17",
      extensionMonths: 6,
    };

    confirmContractRenewal.mockResolvedValue(mockResult);

    await renewalController.confirmRenewal(req, res);

    expect(confirmContractRenewal).toHaveBeenCalledWith(
      "contract-1",
      "tenant-123",
      6
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("confirms renewal with default extension when extensionMonths not provided (utr012)", async () => {
    const { req, res } = createMockReqRes(
      { contractId: "contract-1" },
      {},
      { userId: "tenant-123" }
    );

    const mockResult = {
      contract: {
        _id: "contract-1",
      },
      newEndDate: "2027-07-17",
      extensionMonths: 12,
    };

    confirmContractRenewal.mockResolvedValue(mockResult);

    await renewalController.confirmRenewal(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// TEST 3: declineRenewal
// ────────────────────────────────────────────────────────────────────────────────

describe("renewalController.declineRenewal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns 401 when user is not authenticated (utr013)", async () => {
    const { req, res } = createMockReqRes(
      { contractId: "contract-1" },
      {},
      null
    );

    await renewalController.declineRenewal(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Unauthorized",
    });
  });

  test("returns 400 when contractId is missing (utr014)", async () => {
    const { req, res } = createMockReqRes({}, {}, { userId: "tenant-123" });

    await renewalController.declineRenewal(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Thiếu contractId",
    });
  });

  test("returns 400 when decline fails due to business logic (utr015)", async () => {
    const { req, res } = createMockReqRes(
      { contractId: "contract-1" },
      {},
      { userId: "tenant-123" }
    );

    declineContractRenewal.mockRejectedValue(
      new Error("Hợp đồng không thể từ chối (không trong cửa sổ gia hạn)")
    );

    await renewalController.declineRenewal(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Hợp đồng không thể từ chối (không trong cửa sổ gia hạn)",
    });
  });

  test("successfully declines renewal (utr016)", async () => {
    const { req, res } = createMockReqRes(
      { contractId: "contract-1" },
      {},
      { userId: "tenant-123" }
    );

    const mockResult = {
      message: "Từ chối gia hạn hợp đồng thành công.",
      contract: {
        _id: "contract-1",
        status: "active",
        renewalDeclined: true,
      },
    };

    declineContractRenewal.mockResolvedValue(mockResult);

    await renewalController.declineRenewal(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Từ chối gia hạn hợp đồng thành công.",
      data: {
        contractId: "contract-1",
        status: "active",
        renewalDeclined: true,
      },
    });
  });

  test("returns appropriate message when declining renewal (utr017)", async () => {
    const { req, res } = createMockReqRes(
      { contractId: "contract-1" },
      {},
      { userId: "tenant-123" }
    );

    const mockResult = {
      message:
        "Từ chối gia hạn thành công. Hợp đồng sẽ hết hạn vào 17/06/2026.",
      contract: {
        _id: "contract-1",
        status: "active",
        renewalDeclined: true,
      },
    };

    declineContractRenewal.mockResolvedValue(mockResult);

    await renewalController.declineRenewal(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message:
        "Từ chối gia hạn thành công. Hợp đồng sẽ hết hạn vào 17/06/2026.",
      data: expect.objectContaining({
        contractId: "contract-1",
      }),
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// TEST 4: sendRenewalNotifications (admin/test endpoint)
// ────────────────────────────────────────────────────────────────────────────────

describe("renewalController.sendRenewalNotifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("successfully sends renewal notifications (utr018)", async () => {
    const { req, res } = createMockReqRes({});

    checkAndSendRenewalNotifications.mockResolvedValue({
      sentCount: 3,
      skippedCount: 0,
    });

    await renewalController.sendRenewalNotifications(req, res);

    expect(checkAndSendRenewalNotifications).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message:
        "Đã chạy kiểm tra và gửi thông báo gia hạn hợp đồng",
    });
  });

  test("handles case when no notifications are sent (utr019)", async () => {
    const { req, res } = createMockReqRes({});

    checkAndSendRenewalNotifications.mockResolvedValue({
      sentCount: 0,
      skippedCount: 0,
    });

    await renewalController.sendRenewalNotifications(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message:
        "Đã chạy kiểm tra và gửi thông báo gia hạn hợp đồng",
    });
  });

  test("handles errors when sending notifications (utr020)", async () => {
    const { req, res } = createMockReqRes({});

    checkAndSendRenewalNotifications.mockRejectedValue(
      new Error("Database connection error")
    );

    await renewalController.sendRenewalNotifications(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Database connection error",
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────────
// INTEGRATION TEST SCENARIOS
// ────────────────────────────────────────────────────────────────────────────────

describe("Contract Renewal Integration Scenarios", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("scenario: tenant views renewal preview and confirms renewal (utr021)", async () => {
    // Step 1: View preview
    const previewReq = createMockReqRes(
      {},
      { contractId: "contract-1" },
      { userId: "tenant-123" }
    );

    const previewData = {
      contractId: "contract-1",
      contractCode: "HN/Phòng 308/2026/HDSV/336",
      canRenew: true,
      hasAction: false,
      renewalStatus: null,
    };

    getRenewalPreviewForTenant.mockResolvedValue(previewData);
    await renewalController.getRenewalPreview(previewReq.req, previewReq.res);

    expect(previewReq.res.status).toHaveBeenCalledWith(200);

    // Step 2: Confirm renewal
    const confirmReq = createMockReqRes(
      { contractId: "contract-1", extensionMonths: 12 },
      {},
      { userId: "tenant-123" }
    );

    const confirmResult = {
      contract: { _id: "contract-1" },
      newEndDate: "2027-06-17",
      extensionMonths: 12,
    };

    confirmContractRenewal.mockResolvedValue(confirmResult);
    await renewalController.confirmRenewal(confirmReq.req, confirmReq.res);

    expect(confirmReq.res.status).toHaveBeenCalledWith(200);
  });

  test("scenario: tenant views preview and declines renewal (utr022)", async () => {
    // Step 1: View preview
    const previewReq = createMockReqRes(
      {},
      { contractId: "contract-1" },
      { userId: "tenant-123" }
    );

    const previewData = {
      contractId: "contract-1",
      contractCode: "HN/Phòng 308/2026/HDSV/336",
      canRenew: true,
      hasAction: false,
      renewalStatus: null,
    };

    getRenewalPreviewForTenant.mockResolvedValue(previewData);
    await renewalController.getRenewalPreview(previewReq.req, previewReq.res);

    expect(previewReq.res.status).toHaveBeenCalledWith(200);

    // Step 2: Decline renewal
    const declineReq = createMockReqRes(
      { contractId: "contract-1" },
      {},
      { userId: "tenant-123" }
    );

    const declineResult = {
      message: "Từ chối gia hạn hợp đồng thành công.",
      contract: {
        _id: "contract-1",
        status: "active",
        renewalDeclined: true,
      },
    };

    declineContractRenewal.mockResolvedValue(declineResult);
    await renewalController.declineRenewal(declineReq.req, declineReq.res);

    expect(declineReq.res.status).toHaveBeenCalledWith(200);
  });

  test("scenario: tenant cannot renew contract outside renewal window (utr023)", async () => {
    const { req, res } = createMockReqRes(
      {},
      { contractId: "contract-1" },
      { userId: "tenant-123" }
    );

    const previewData = {
      contractId: "contract-1",
      contractCode: "HN/Phòng 308/2026/HDSV/336",
      canRenew: false,
      hasAction: false,
      blockingReason: "Hợp đồng không trong cửa sổ gia hạn (còn >30 ngày)",
    };

    getRenewalPreviewForTenant.mockResolvedValue(previewData);
    await renewalController.getRenewalPreview(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: previewData,
      message: previewData.blockingReason,
    });
  });

  test("scenario: attempting to confirm renewal on already renewed contract (utr024)", async () => {
    const { req, res } = createMockReqRes(
      { contractId: "contract-1", extensionMonths: 12 },
      {},
      { userId: "tenant-123" }
    );

    confirmContractRenewal.mockRejectedValue(
      new Error("Hợp đồng đã được gia hạn")
    );

    await renewalController.confirmRenewal(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Hợp đồng đã được gia hạn",
    });
  });
});
