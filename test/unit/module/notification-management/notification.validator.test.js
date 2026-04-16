const { validateTitle, validateContent } = require("../../../../src/modules/notification-management/validators/notification.validator");

describe("Notification Validator Unit Tests", () => {
    describe("validateTitle", () => {
        test("Return valid:false if title is empty", () => {
            const result = validateTitle("");
            expect(result.valid).toBe(false);
            expect(result.message).toMatch(/Tiêu đề thông báo không được để trống/);
        });

        test("Return valid:false if title exceeds 200 chars", () => {
            const result = validateTitle("A".repeat(201));
            expect(result.valid).toBe(false);
            expect(result.message).toMatch(/không được vượt quá 200 ký tự/);
        });

        test("Return valid:true for valid title", () => {
            const result = validateTitle("Thông báo mới");
            expect(result.valid).toBe(true);
        });
    });

    describe("validateContent", () => {
        test("Return valid:false if content is empty", () => {
            const result = validateContent("");
            expect(result.valid).toBe(false);
            expect(result.message).toMatch(/Nội dung thông báo không được để trống/);
        });

        test("Return valid:false if content exceeds 1000 chars", () => {
            const result = validateContent("A".repeat(1001));
            expect(result.valid).toBe(false);
            expect(result.message).toMatch(/không được vượt quá 1000 ký tự/);
        });

        test("Return valid:true for valid content", () => {
            const result = validateContent("Đây là nội dung hợp lệ");
            expect(result.valid).toBe(true);
        });
    });
});
