/**
 * Script seed dữ liệu mẫu cho nội quy tòa nhà
 * Chạy bằng lệnh: node src/database/seeders/seed-building-rules.js
 */
const mongoose = require("mongoose");
const BuildingRules = require("../../modules/building-information/models/building-rules.model");
require("dotenv").config();

// Dữ liệu mẫu cho nội quy tòa nhà
const sampleRulesData = {
  title: "Nội Quy Tòa Nhà",
  description:
    "Để đảm bảo môi trường sống thoải mái và an toàn cho tất cả cư dân, vui lòng tuân thủ các quy định dưới đây",
  importantNotice: {
    title: "Thông Báo Quan Trọng",
    content:
      "Mọi cư dân phải tuân thủ đầy đủ các nội quy của tòa nhà. Vi phạm nội quy có thể dẫn đến cảnh báo, phạt tiền, hoặc yêu cầu chuyển đi. Các trường hợp vi phạm nghiêm trọng sẽ được báo cáo cho cơ quan chức năng.",
  },
  categories: [
    {
      title: "Giờ Yên Tĩnh & Sinh Hoạt",
      icon: "Clock",
      rules: [
        "Giờ yên tĩnh: 23:00 - 7:00 hôm sau",
        "Không gây tiếng ồn quá 80dB trong giờ yên tĩnh",
        "Không tổ chức tiệc tùng hay sự kiện lớn",
        "Nhạc, tivi phải ở âm lượng vừa phải",
        "Chung cư là nơi ở chung, cần tôn trọng hàng xóm",
      ],
    },
    {
      title: "Vệ Sinh & Bảo Trì",
      icon: "Home",
      rules: [
        "Giữ sạch sẽ phòng của mình mỗi ngày",
        "Không xả rác bất kỳ lên cầu thang, sân chung",
        "Phải bảo quản nước rửa mặt, tránh làm ẩm mưa",
        "Thông báo ngay khi có sự cố về điện, nước, điều hòa",
        "Bảo quản sạch sẽ chỗ để xe của mình",
      ],
    },
    {
      title: "An Ninh & Trật Tự",
      icon: "Shield",
      rules: [
        "Không cho phép khách lạ vào khu vực riêng tư",
        "Phải khoá cửa phòng khi vắng mặt",
        "Không được nuôi thú cưng nguy hiểm",
        "Không được cất giữ vật nổ hay chất cấm",
        "Phải tuân thủ kiểm tra an ninh tại cổng",
      ],
    },
    {
      title: "Khách Thăm Viếng",
      icon: "Users",
      rules: [
        "Khách phải được thông báo cho quản lý",
        "Khách không được ở lại quá 22:00 đêm",
        "Khách phải đợi chủ phòng tại sảnh hoặc phòng",
        "Cấm khách sử dụng chung cư như chỗ ở của riêng mình",
        "Chủ phòng chịu trách nhiệm với hành động của khách",
      ],
    },
    {
      title: "Điện Nước & Tiện Ích",
      icon: "Zap",
      rules: [
        "Sử dụng điện nước tiết kiệm, tránh lãng phí",
        "Tắt điện khi rời phòng lâu",
        "Kiểm tra vòi nước trước khi rời phòng",
        "Không được sửa chữa đồ điện một cách bất kỳ",
        "Báo cáo ngay hư hỏng cho quản lý",
      ],
    },
    {
      title: "Hành Vi Cấm",
      icon: "AlertCircle",
      rules: [
        "Cấm hút thuốc lá trong phòng (được phép ở ban công)",
        "Cấm sử dụng rượu bia quá mức gây rối loạn",
        "Cấm các hoạt động bất hợp pháp",
        "Cấm nuôi thú cưng (trừ cá cảnh, chim)",
        "Cấm thay đổi cấu trúc, màu sơn phòng",
      ],
    },
  ],
  guidelines: [
    {
      title: "Thời Hạn Thuê Nhà",
      content:
        "Hợp đồng thuê nhà có hiệu lực từ ngày ký. Mỗi tháng phải thanh toán tiền nhà vào hôm thứ 1 của tháng. Nợ tiền quá 5 ngày sẽ bị yêu cầu dọn dẹp và rời khỏi.",
    },
    {
      title: "Bảo Hiểm & Trách Nhiệm",
      content:
        "Cư dân chịu trách nhiệm bảo quản và bảo dưỡng các tài sản trong phòng của mình. Tòa nhà không chịu trách nhiệm cho các mất mát, đánh cắp hay hư hỏng ngoài ý muốn.",
    },
    {
      title: "Sửa Chữa & Bảo Dưỡng",
      content:
        "Mọi sửa chữa hoặc cải tạo đều phải có sự đồng ý của quản lý. Các lỗi do cư dân gây ra sẽ được tính phí sửa chữa.",
    },
    {
      title: "Thúc Đẩy Cộng Đồng",
      content:
        "Chúng tôi khuyến khích các hoạt động xã hội lành mạnh và tình yêu thương giữa các cư dân. Các sự kiện chung cần được thông báo cho quản lý trước.",
    },
  ],
  contact: {
    phone: "(028) 1234 5678",
    zalo: "https://zalo.me/0812345678",
  },
  status: "active",
};

/**
 * Hàm seed dữ liệu nội quy vào database
 * - Kết nối với MongoDB
 * - Xóa dữ liệu cũ (nếu có)
 * - Thêm dữ liệu mẫu mới
 */
const seedBuildingRules = async () => {
  try {
    // Kết nối với MongoDB
    await mongoose.connect(
      process.env.MONGO_URI || "mongodb://localhost:27017/building_management",
    );

    console.log("Connected to MongoDB");

    // Xóa nội quy cũ (nếu có)
    await BuildingRules.deleteMany({});
    console.log("Deleted existing building rules");

    // Thêm dữ liệu mẫu
    const newRules = new BuildingRules(sampleRulesData);
    await newRules.save();

    console.log("✅ Building rules seeded successfully!");
    console.log("Rule ID:", newRules._id);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding building rules:", error);
    process.exit(1);
  }
};

seedBuildingRules();
