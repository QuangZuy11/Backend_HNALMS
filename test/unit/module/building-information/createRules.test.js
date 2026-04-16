/**
 * createRules.test.js - KIỂM THỬ INPUT CHO CHỨC NĂNG THÊM DANH MỤC NỘI QUY
 *
 * Chỉ kiểm tra các trường người dùng nhập vào:
 * - title: tiêu đề danh mục
 * - icon: biểu tượng
 * - rules: danh sách quy định
 * - status: trạng thái
 */

const BuildingRules = require("../../../../src/modules/building-information/models/building-rules.model");

jest.mock("../../../../src/modules/building-information/models/building-rules.model");

describe("KIỂM THỬ INPUT - Thêm danh mục nội quy", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    BuildingRules.mockImplementation((data) => ({
      ...data,
      save: jest.fn().mockResolvedValue({
        _id: "mock-id-1",
        ...data,
      }),
    }));
  });

  test("INP-01: tiêu đề hợp lệ, biểu tượng hợp lệ, quy định có dữ liệu", async () => {
    const input = {
      categories: [
        {
          title: "Giờ Yên Tĩnh & Sinh Hoạt",
          icon: "Clock",
          rules: ["Không gây ồn sau 22h"],
        },
      ],
      status: "active",
    };

    const doc = new BuildingRules(input);
    const result = await doc.save();

    expect(result.categories[0].title).toBe("Giờ Yên Tĩnh & Sinh Hoạt");
    expect(result.categories[0].icon).toBe("Clock");
    expect(result.categories[0].rules).toEqual(["Không gây ồn sau 22h"]);
    expect(result.status).toBe("active");
  });

  test("INP-02: tiêu đề rỗng", async () => {
    const input = {
      categories: [
        {
          title: "",
          icon: "Clock",
          rules: ["Không gây ồn sau 22h"],
        },
      ],
      status: "active",
    };

    const doc = new BuildingRules(input);
    const result = await doc.save();

    expect(result.categories[0].title).toBe("");
  });

  test("INP-03: biểu tượng hợp lệ", async () => {
    const input = {
      categories: [
        {
          title: "An Ninh & Trật Tự",
          icon: "Shield",
          rules: ["Đóng cửa cẩn thận khi ra vào"],
        },
      ],
      status: "active",
    };

    const doc = new BuildingRules(input);
    const result = await doc.save();

    expect(result.categories[0].icon).toBe("Shield");
  });

  test("INP-04: biểu tượng không hợp lệ", async () => {
    const input = {
      categories: [
        {
          title: "An Ninh & Trật Tự",
          icon: "InvalidIcon",
          rules: ["Đóng cửa cẩn thận khi ra vào"],
        },
      ],
      status: "active",
    };

    const doc = new BuildingRules(input);
    const result = await doc.save();

    expect(result.categories[0].icon).toBe("InvalidIcon");
  });

  test("INP-05: quy định có nhiều phần tử", async () => {
    const input = {
      categories: [
        {
          title: "Vệ Sinh",
          icon: "Home",
          rules: ["Giữ vệ sinh khu vực chung", "Không xả rác bừa bãi"],
        },
      ],
      status: "active",
    };

    const doc = new BuildingRules(input);
    const result = await doc.save();

    expect(result.categories[0].rules).toEqual([
      "Giữ vệ sinh khu vực chung",
      "Không xả rác bừa bãi",
    ]);
  });

  test("INP-06: danh sách quy định rỗng", async () => {
    const input = {
      categories: [
        {
          title: "Vệ Sinh",
          icon: "Home",
          rules: [],
        },
      ],
      status: "active",
    };

    const doc = new BuildingRules(input);
    const result = await doc.save();

    expect(result.categories[0].rules).toEqual([]);
  });

  test("INP-07: trạng thái = active", async () => {
    const input = {
      categories: [
        {
          title: "Giờ Yên Tĩnh & Sinh Hoạt",
          icon: "Clock",
          rules: ["Không gây ồn sau 22h"],
        },
      ],
      status: "active",
    };

    const doc = new BuildingRules(input);
    const result = await doc.save();

    expect(result.status).toBe("active");
  });

  test("INP-08: trạng thái = inactive", async () => {
    const input = {
      categories: [
        {
          title: "Giờ Yên Tĩnh & Sinh Hoạt",
          icon: "Clock",
          rules: ["Không gây ồn sau 22h"],
        },
      ],
      status: "inactive",
    };

    const doc = new BuildingRules(input);
    const result = await doc.save();

    expect(result.status).toBe("inactive");
  });
});
