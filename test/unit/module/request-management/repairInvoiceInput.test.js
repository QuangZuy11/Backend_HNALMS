/**
 * Unit test input for manager creating repair invoice (update repair status)
 *
 * Chỉ test 2 trường: Tiêu đề hóa đơn + Tổng số tiền
 */

const {
  validateUpdateRepairStatus,
} = require("../../../../src/modules/request-management/validators/request.validator");

describe("validateUpdateRepairStatus (invoice title & total amount)", () => {
  test("returns error when invoice title is missing", () => {
    const result = validateUpdateRepairStatus({
      status: "Done",
      paymentType: "REVENUE",
      invoiceTotalAmount: 100000,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Tiêu đề hóa đơn là bắt buộc");
  });

  test("returns error when total amount is missing", () => {
    const result = validateUpdateRepairStatus({
      status: "Done",
      paymentType: "REVENUE",
      invoiceTitle: "Sửa chữa",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Tổng số tiền là bắt buộc");
  });

  test("returns error when total amount is invalid", () => {
    const result = validateUpdateRepairStatus({
      status: "Done",
      paymentType: "REVENUE",
      invoiceTitle: "Sửa chữa",
      invoiceTotalAmount: -1000,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Tổng số tiền phải là số hợp lệ và lớn hơn hoặc bằng 0"
    );
  });

  test("returns valid when invoice title and total amount are valid", () => {
    const result = validateUpdateRepairStatus({
      status: "Done",
      paymentType: "REVENUE",
      invoiceTitle: "Sửa chữa",
      invoiceTotalAmount: 100000,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
