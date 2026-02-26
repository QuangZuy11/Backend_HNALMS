/**
 * dbHandler.js
 * Helper dùng chung cho Integration Tests.
 * Khởi động MongoDB in-memory, connect mongoose, clear data, disconnect.
 *
 * Cách dùng trong test file:
 *
 *   const dbHandler = require('../helpers/dbHandler');
 *   beforeAll(async () => await dbHandler.connect());
 *   afterEach(async () => await dbHandler.clear());
 *   afterAll(async () => await dbHandler.disconnect());
 */

const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");

let mongod;

/**
 * Khởi động MongoDB in-memory và connect mongoose vào đó.
 */
const connect = async () => {
    // Ngắt kết nối cũ nếu có
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }

    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    await mongoose.connect(uri);
};

/**
 * Xoá tất cả collections sau mỗi test case (đảm bảo test độc lập).
 */
const clear = async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
};

/**
 * Ngắt kết nối mongoose và dừng MongoDB in-memory.
 */
const disconnect = async () => {
    await mongoose.disconnect();
    if (mongod) {
        await mongod.stop();
    }
};

module.exports = { connect, clear, disconnect };
