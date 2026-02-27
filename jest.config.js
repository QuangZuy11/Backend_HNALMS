/** @type {import('jest').Config} */
module.exports = {
    // Môi trường chạy test: Node.js (không phải browser)
    testEnvironment: "node",

    // Thư mục chứa file test
    testMatch: [
        "**/test/**/*.test.js",
        "**/test/**/*.spec.js",
    ],

    // Bỏ qua node_modules
    testPathIgnorePatterns: ["/node_modules/"],

    // Hiển thị kết quả chi tiết từng test
    verbose: true,

    // Timeout mỗi test (ms) - tăng vì mongodb-memory-server cần thời gian khởi động
    testTimeout: 30000,

    // Cấu hình coverage
    collectCoverageFrom: [
        "src/**/*.js",
        "!src/shared/config/**",
        "!src/database/**",
        "!src/**/index.js",
    ],
    coverageDirectory: "coverage",
    coverageReporters: ["text", "lcov", "html"],

    // Xoá mock sau mỗi test case
    clearMocks: true,
    restoreMocks: true,
};

