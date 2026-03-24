// Report performance: tỷ lệ lấp đầy, phòng trống theo tháng
const Room = require("../../room-floor-management/models/room.model");
const Contract = require("../../contract-management/models/contract.model");

/**
 * Tính số phòng trống & tỷ lệ lấp đầy theo từng tháng
 *
 * @param {Object} params
 * @param {string} params.startMonth  - Format: "YYYY-MM" (vd "2025-01")
 * @param {string} params.endMonth    - Format: "YYYY-MM" (vd "2026-03")
 * @returns {Array} [{ month, occupied, vacant, vacancyRate, occupancyRate }, ...]
 */
exports.getVacancyByMonth = async ({ startMonth, endMonth } = {}) => {
  // Default: 12 tháng gần nhất
  if (!startMonth || !endMonth) {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), 1); // tháng hiện tại
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1); // 6 tháng gần nhất
    startMonth = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    endMonth = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}`;
  }

  // Lấy tổng số phòng đang active
  const totalRooms = await Room.countDocuments({ isActive: true });
  if (totalRooms === 0) return [];

  // Parse start/end
  const [sy, sm] = startMonth.split("-").map(Number);
  const [ey, em] = endMonth.split("-").map(Number);

  const results = [];

  // Duyệt từng tháng trong khoảng
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    const monthStr = `${y}-${String(m).padStart(2, "0")}`;

    // Tính ngày đầu/cuối tháng
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 1); // exclusive upper bound

    // Tìm tất cả hợp đồng active trùng với tháng này
    // Điều kiện: startDate < monthEnd AND endDate >= monthStart
    const activeContracts = await Contract.find({
      status: "active",
      startDate: { $lt: monthEnd },
      endDate: { $gte: monthStart },
    })
      .select("roomId")
      .lean();

    // Đếm số phòng distinct có hợp đồng
    const occupiedRoomIds = new Set(
      activeContracts.map((c) => c.roomId.toString()),
    );
    const occupied = occupiedRoomIds.size;
    const vacant = totalRooms - occupied;
    const vacancyRate = totalRooms > 0 ? Math.round((vacant / totalRooms) * 1000) / 10 : 0;
    const occupancyRate = totalRooms > 0 ? Math.round((occupied / totalRooms) * 1000) / 10 : 0;

    results.push({
      month: monthStr,
      occupied,
      vacant,
      vacancyRate,
      occupancyRate,
    });

    // Next month
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
exports.getCurrentSnapshot = async (month) => {
  const totalRooms = await Room.countDocuments({ isActive: true });

  let monthStart, monthEnd;
  if (month) {
    const [y, m] = month.split("-").map(Number);
    monthStart = new Date(y, m - 1, 1);
    monthEnd = new Date(y, m, 1);
  } else {
    const now = new Date();
    monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  const activeContracts = await Contract.find({
    status: "active",
    startDate: { $lt: monthEnd },
    endDate: { $gte: monthStart },
  })
    .select("roomId")
    .lean();

  const occupiedRoomIds = new Set(activeContracts.map((c) => c.roomId.toString()));
  const occupied = occupiedRoomIds.size;
  const vacant = totalRooms - occupied;
  const occupancyRate = totalRooms > 0 ? Math.round((occupied / totalRooms) * 1000) / 10 : 0;

  return {
    totalRooms,
    occupied,
    vacant,
    occupancyRate,
  };
};
