/**
 * deposit.api.test.js  -  INTEGRATION TEST
 *
 * Test các API endpoint của Deposit Management.
 * Dùng:
 *   - supertest   : gửi HTTP request đến Express app
 *   - dbHandler   : MongoDB in-memory (không cần MongoDB Atlas)
 *   - jest.mock() : giả lập connectDB (tránh kết nối DB thật trong app.js)
 *
 * Chạy: npm run test:integration
 */

// ─── 1. Mock connectDB trước khi require app ────────────────────────────────────
// Bắt buộc mock trước vì app.js gọi connectDB() khi được require
jest.mock("../../../src/shared/config/database", () => jest.fn().mockResolvedValue(true));

// ─── 2. Mock email service (tránh gửi email thật trong test) ───────────────────
jest.mock("../../../src/modules/notification-management/services/email.service", () => ({
    sendEmail: jest.fn().mockResolvedValue(true),
    verifyEmailConfig: jest.fn().mockResolvedValue(true),
}));

const request = require("supertest");
const app = require("../../../src/app");
const dbHandler = require("../helpers/dbHandler");
const mongoose = require("mongoose");

// Import model để seed data
const Deposit = require("../../../src/modules/contract-management/models/deposit.model");
const Room = require("../../../src/modules/room-floor-management/models/room.model");

// ─── 3. Setup / Teardown DB in-memory ──────────────────────────────────────────
beforeAll(async () => await dbHandler.connect());
afterEach(async () => await dbHandler.clear());
afterAll(async () => await dbHandler.disconnect());

// ─── 4. Fixtures ───────────────────────────────────────────────────────────────
const createMockRoom = async (overrides = {}) => {
    const RoomType = mongoose.model("RoomType", new mongoose.Schema({
        typeName: String,
        currentPrice: Number,
        personMax: Number,
    }), "roomtypes");

    const roomType = await RoomType.create({
        typeName: "Phòng đơn",
        currentPrice: 3000000,
        personMax: 2,
    });

    return Room.create({
        name: "101",
        status: "Available",
        roomTypeId: roomType._id,
        ...overrides,
    });
};

// ─── 5. Test cases ─────────────────────────────────────────────────────────────

describe("GET /api/deposits", () => {
    test("should return empty array when no deposits", async () => {
        const res = await request(app).get("/api/deposits/");

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBe(0);
    });

    test("should return list of deposits", async () => {
        // Seed: tạo 2 deposit giả vào DB in-memory
        await Deposit.create([
            {
                name: "Nguyễn Văn A",
                phone: "0901234567",
                email: "a@mail.com",
                room: new mongoose.Types.ObjectId(),
                amount: 3000000,
                status: "Held",
            },
            {
                name: "Trần Thị B",
                phone: "0907654321",
                email: "b@mail.com",
                room: new mongoose.Types.ObjectId(),
                amount: 4000000,
                status: "Pending",
            },
        ]);

        const res = await request(app).get("/api/deposits/");

        expect(res.statusCode).toBe(200);
        expect(res.body.data.length).toBe(2);
    });
});

describe("GET /api/deposits/:id", () => {
    test("should return deposit by valid id", async () => {
        const deposit = await Deposit.create({
            name: "Nguyễn Văn A",
            phone: "0901234567",
            email: "a@mail.com",
            room: new mongoose.Types.ObjectId(),
            amount: 3000000,
            status: "Held",
        });

        const res = await request(app).get(`/api/deposits/${deposit._id}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.name).toBe("Nguyễn Văn A");
    });

    test("should return 404 when deposit not found", async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request(app).get(`/api/deposits/${fakeId}`);

        expect(res.statusCode).toBe(404);
        expect(res.body.success).toBe(false);
    });

    test("should return 400 when id is invalid ObjectId", async () => {
        const res = await request(app).get("/api/deposits/invalid-id");

        expect(res.statusCode).toBe(400);
    });
});
