const mongoose = require("mongoose");
const Contract = require("../models/contract.model");

/**
 * HĐ kế tiếp khách A: bất kỳ HĐ nào (trừ terminated/expired) có startDate sau endDate của HĐ đang từ chối gia hạn.
 */
async function findSuccessorContractAfterDeclined(declinedLease, roomId, session = null) {
  if (!declinedLease) return null;
  let q = Contract.findOne({
    roomId,
    _id: { $ne: declinedLease._id },
    status: { $nin: ["terminated", "expired"] },
    startDate: { $gt: declinedLease.endDate },
  });
  if (session) q = q.session(session);
  return q;
}

/**
 * Có HĐ active đã kích hoạt + declined, và đã tồn tại HĐ kế tiếp → chặn khách B (cọc / tạo HĐ).
 */
async function hasBookedSuccessorAfterDeclinedLease(roomId, session = null) {
  let decliningQ = Contract.findOne({
    roomId,
    status: "active",
    isActivated: true,
    renewalStatus: "declined",
  }).sort({ startDate: -1 });
  if (session) decliningQ = decliningQ.session(session);
  const decliningLease = await decliningQ;
  if (!decliningLease) return false;
  const successor = await findSuccessorContractAfterDeclined(decliningLease, roomId, session);
  return !!successor;
}

/** Map roomId (string) → đã có HĐ kế tiếp sau kỳ declined (batch cho GET /rooms). */
async function successorLeaseBookedByRoomIds(roomIds) {
  const map = Object.create(null);
  if (!roomIds?.length) return map;

  const ids = roomIds.map((id) => id);
  for (const id of ids) {
    map[id.toString()] = false;
  }

  const decliningLeases = await Contract.find({
    roomId: { $in: ids },
    status: "active",
    isActivated: true,
    renewalStatus: "declined",
  })
    .select("roomId endDate startDate _id")
    .lean();

  if (!decliningLeases.length) return map;

  const bestByRoom = {};
  for (const d of decliningLeases) {
    const k = d.roomId.toString();
    const prev = bestByRoom[k];
    if (!prev || new Date(d.startDate) > new Date(prev.startDate)) {
      bestByRoom[k] = d;
    }
  }

  const decliningRoomObjIds = Object.keys(bestByRoom).map(
    (k) => new mongoose.Types.ObjectId(k),
  );

  const candidates = await Contract.find({
    roomId: { $in: decliningRoomObjIds },
    status: { $nin: ["terminated", "expired"] },
  })
    .select("roomId startDate _id")
    .lean();

  for (const k of Object.keys(bestByRoom)) {
    const decl = bestByRoom[k];
    const endD = new Date(decl.endDate);
    const hasSucc = candidates.some(
      (c) =>
        c.roomId.toString() === k &&
        c._id.toString() !== decl._id.toString() &&
        new Date(c.startDate) > endD,
    );
    map[k] = hasSucc;
  }

  return map;
}

module.exports = {
  findSuccessorContractAfterDeclined,
  hasBookedSuccessorAfterDeclinedLease,
  successorLeaseBookedByRoomIds,
};
