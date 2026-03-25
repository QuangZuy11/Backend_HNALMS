// Báo cáo: thống kê sửa chữa và bảo trì theo tháng
const RepairRequest = require("../../request-management/models/repair_requests.model");

/**
 * Thống kê sửa chữa & bảo trì theo tháng trong khoảng thời gian
 *
 * @param {Object} params
 * @param {string} params.startMonth - Format: "YYYY-MM"
 * @param {string} params.endMonth   - Format: "YYYY-MM"
 * @returns {Array} [{ month, total, repairs, maintenance, pending, processing, done, unpaid, paid }, ...]
 */
exports.getMaintenanceByMonth = async ({ startMonth, endMonth } = {}) => {
  // Default: 6 tháng gần nhất
  if (!startMonth || !endMonth) {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    startMonth = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    endMonth = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}`;
  }

  const [sy, sm] = startMonth.split("-").map(Number);
  const [ey, em] = endMonth.split("-").map(Number);

  const results = [];

  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    const monthStr = `${y}-${String(m).padStart(2, "0")}`;
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 1); // exclusive upper bound

    const requests = await RepairRequest.find({
      createdDate: { $gte: monthStart, $lt: monthEnd },
    }).lean();

    const total = requests.length;
    const repairs = requests.filter((r) => r.type === "Sửa chữa").length;
    const maintenance = requests.filter((r) => r.type === "Bảo trì").length;
    const pending = requests.filter((r) => r.status === "Pending").length;
    const processing = requests.filter((r) => r.status === "Processing").length;
    const done = requests.filter((r) => r.status === "Done").length;
    const unpaid = requests.filter((r) => r.status === "Unpaid").length;
    const paid = requests.filter((r) => r.status === "Paid").length;

    results.push({
      month: monthStr,
      total,
      repairs,
      maintenance,
      pending,
      processing,
      done,
      unpaid,
      paid,
    });

    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  return results;
};

/**
 * Thống kê tổng quan cho một tháng cụ thể
 * @param {string} month - Format: "YYYY-MM"
 */
exports.getSnapshotByMonth = async (month) => {
  console.log("[getSnapshotByMonth] called with month:", month);
  let monthStart, monthEnd;
  if (month) {
    const [y, mo] = month.split("-").map(Number);
    monthStart = new Date(y, mo - 1, 1);
    monthEnd = new Date(y, mo, 1);
  } else {
    const now = new Date();
    monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }
  console.log("[getSnapshotByMonth] range:", monthStart.toISOString(), "to", monthEnd.toISOString());

  const requests = await RepairRequest.find({
    createdDate: { $gte: monthStart, $lt: monthEnd },
  }).lean();
  console.log("[getSnapshotByMonth] found:", requests.length, "requests");

  const total = requests.length;
  const repairs = requests.filter((r) => r.type === "Sửa chữa").length;
  const maintenance = requests.filter((r) => r.type === "Bảo trì").length;
  const pending = requests.filter((r) => r.status === "Pending").length;
  const processing = requests.filter((r) => r.status === "Processing").length;
  const done = requests.filter((r) => r.status === "Done").length;
  const unpaid = requests.filter((r) => r.status === "Unpaid").length;
  const paid = requests.filter((r) => r.status === "Paid").length;

  return {
    total,
    repairs,
    maintenance,
    pending,
    processing,
    done,
    unpaid,
    paid,
  };
};

/**
 * Tìm tháng có số lượng sửa chữa/bảo trì cao nhất trong khoảng thời gian
 * @param {string} startMonth
 * @param {string} endMonth
 */
exports.getPeakMonth = async ({ startMonth, endMonth } = {}) => {
  const data = await exports.getMaintenanceByMonth({ startMonth, endMonth });
  if (!data || data.length === 0) return null;

  const peak = data.reduce((prev, curr) =>
    curr.total > prev.total ? curr : prev,
  );
  return peak;
};
