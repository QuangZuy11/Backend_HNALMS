require("dotenv").config();
const app = require("./src/app");

const PORT = process.env.PORT || 9999;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📝 API Documentation: http://localhost:${PORT}/api`);
    console.log(`🧪 Test DB: http://localhost:${PORT}/test-db`);
});