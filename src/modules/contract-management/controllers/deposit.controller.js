const Deposit = require("../models/deposit.model");
const Room = require("../../room-floor-management/models/room.model");

const getAllDeposits = async (req, res) => {
  try {
    const deposits = await Deposit.find()
      .populate({
        path: "room",
        select: "name type price maxPersons", // Select relevant room fields
      })
      .sort({ createdDate: -1 });

    res.status(200).json({
      success: true,
      message: "Fetched deposits successfully",
      data: deposits,
    });
  } catch (error) {
    console.error("Error in getAllDeposits:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching deposits",
      error: error.message,
    });
  }
};

const createDeposit = async (req, res) => {
  try {
    const { name, phone, email, room, amount } = req.body;

    // Validate required fields
    if (!name || !phone || !email || !room || !amount) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: name, phone, email, room, amount",
      });
    }

    // Check if room exists
    const roomExists = await Room.findById(room);
    if (!roomExists) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    // Check if room already has an active deposit
    const existingDeposit = await Deposit.findOne({
      room: room,
      status: "Held",
    });
    if (existingDeposit) {
      return res.status(400).json({
        success: false,
        message: "This room already has an active deposit",
      });
    }

    // Create new deposit
    const newDeposit = new Deposit({
      name,
      phone,
      email,
      room,
      amount,
      status: "Held",
      createdDate: new Date(),
    });

    await newDeposit.save();

    // Update room status to Deposited
    await Room.findByIdAndUpdate(room, { status: "Deposited" });

    res.status(201).json({
      success: true,
      message: "Deposit created successfully",
      data: newDeposit,
    });
  } catch (error) {
    console.error("Error in createDeposit:", error);
    res.status(500).json({
      success: false,
      message: "Error creating deposit",
      error: error.message,
    });
  }
};

const getDepositById = async (req, res) => {
  try {
    const { id } = req.params;
    const deposit = await Deposit.findById(id).populate({
      path: "room",
      select: "name type price maxPersons",
    });

    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: "Deposit not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Fetched deposit successfully",
      data: deposit,
    });
  } catch (error) {
    console.error("Error in getDepositById:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching deposit",
      error: error.message,
    });
  }
};

module.exports = {
  getAllDeposits,
  createDeposit,
  getDepositById,
};
