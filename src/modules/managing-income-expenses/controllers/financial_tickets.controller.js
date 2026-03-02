const FinancialTicket = require("../models/financial_tickets");
const RepairRequest = require("../../request-management/models/repair_requests.model");
const Contract = require("../../contract-management/models/contract.model");
const Room = require("../../room-floor-management/models/room.model");

/**
 * GET /api/financial-tickets/payments
 * Lấy danh sách phiếu chi (Payment) cho kế toán
 * Query params: from, to, keyword, roomSearch (tìm kiếm theo tên phòng hoặc roomCode)
 */
const getPaymentTickets = async (req, res) => {
  try {
    const { from, to, keyword, roomSearch } = req.query || {};

    const filter = { type: "Payment" };

    if (from || to) {
      filter.transactionDate = {};
      if (from) {
        filter.transactionDate.$gte = new Date(from);
      }
      if (to) {
        // bao gồm cả ngày "to" đến cuối ngày
        const endDate = new Date(to);
        endDate.setHours(23, 59, 59, 999);
        filter.transactionDate.$lte = endDate;
      }
    }

    if (keyword) {
      filter.title = { $regex: keyword, $options: "i" };
    }

    // Lấy tất cả phiếu chi
    let tickets = await FinancialTicket.find(filter)
      .populate({
        path: "referenceId",
        model: RepairRequest,
        select: "tenantId",
      })
      .sort({ transactionDate: -1 })
      .lean();

    // Nếu có filter theo roomSearch (tìm kiếm theo tên phòng hoặc roomCode), lọc lại
    if (roomSearch && roomSearch.trim()) {
      const searchTerm = roomSearch.trim().toLowerCase();
      const filteredTickets = [];
      
      for (const ticket of tickets) {
        if (ticket.referenceId && ticket.referenceId.tenantId) {
          // Tìm hợp đồng active của tenant để lấy roomId
          const activeContract = await Contract.findOne({
            tenantId: ticket.referenceId.tenantId,
            status: "active",
          })
            .populate({
              path: "roomId",
              select: "_id name roomCode",
              model: Room,
            })
            .lean();

          if (activeContract && activeContract.roomId) {
            const room = activeContract.roomId;
            const roomName = (room.name || "").toLowerCase();
            const roomCode = (room.roomCode || "").toLowerCase();
            
            // Tìm kiếm trong tên phòng hoặc roomCode
            if (roomName.includes(searchTerm) || roomCode.includes(searchTerm)) {
              filteredTickets.push(ticket);
            }
          }
        }
      }
      
      tickets = filteredTickets;
    }

    // Populate thông tin phòng cho mỗi ticket
    const ticketsWithRoom = await Promise.all(
      tickets.map(async (ticket) => {
        let roomInfo = null;
        
        if (ticket.referenceId && ticket.referenceId.tenantId) {
          const activeContract = await Contract.findOne({
            tenantId: ticket.referenceId.tenantId,
            status: "active",
          })
            .populate({
              path: "roomId",
              select: "_id name roomCode",
              model: Room,
            })
            .lean();

          if (activeContract && activeContract.roomId) {
            roomInfo = {
              _id: activeContract.roomId._id,
              name: activeContract.roomId.name,
              roomCode: activeContract.roomId.roomCode,
            };
          }
        }

        return {
          ...ticket,
          room: roomInfo,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: ticketsWithRoom,
      total: ticketsWithRoom.length,
    });
  } catch (error) {
    console.error("Error fetching payment tickets:", error);
    res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách phiếu chi",
    });
  }
};

module.exports = {
  getPaymentTickets,
};

