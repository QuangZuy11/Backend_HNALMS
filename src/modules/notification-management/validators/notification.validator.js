/**
 * Kiểm tra tính hợp lệ của tiêu đề thông báo
 * @param {string} title - Tiêu đề cần kiểm tra
 * @returns {Object} { valid: boolean, message: string }
 */
const validateTitle = (title) => {
    if (!title || title.trim().length === 0) {
        return {
            valid: false,
            message: "Tiêu đề thông báo không được để trống"
        };
    }

    if (title.trim().length > 200) {
        return {
            valid: false,
            message: "Tiêu đề thông báo không được vượt quá 200 ký tự"
        };
    }

    return { valid: true };
};

/**
 * Kiểm tra tính hợp lệ của nội dung thông báo
 * @param {string} content - Nội dung cần kiểm tra
 * @returns {Object} { valid: boolean, message: string }
 */
const validateContent = (content) => {
    if (!content || content.trim().length === 0) {
        return {
            valid: false,
            message: "Nội dung thông báo không được để trống"
        };
    }

    if (content.trim().length > 1000) {
        return {
            valid: false,
            message: "Nội dung thông báo không được vượt quá 1000 ký tự"
        };
    }

    return { valid: true };
};

/**
 * Middleware kiểm tra nội dung thông báo (title và content)
 */
const validateNotificationContent = (req, res, next) => {
    const { title, content } = req.body || {};

    // Kiểm tra tiêu đề
    const titleValidation = validateTitle(title);
    if (!titleValidation.valid) {
        return res.status(400).json({
            success: false,
            message: titleValidation.message
        });
    }

    // Kiểm tra nội dung
    const contentValidation = validateContent(content);
    if (!contentValidation.valid) {
        return res.status(400).json({
            success: false,
            message: contentValidation.message
        });
    }

    // Loại bỏ khoảng trắng thừa
    req.body.title = title.trim();
    req.body.content = content.trim();

    next();
};

/**
 * Middleware kiểm tra tham số phân trang
 */
const validatePagination = (req, res, next) => {
    const { page, limit, is_read, status } = req.query || {};

    // Kiểm tra số trang
    if (page !== undefined) {
        const pageNum = parseInt(page);
        if (isNaN(pageNum) || pageNum < 1) {
            return res.status(400).json({
                success: false,
                message: "Số trang phải là số nguyên dương"
            });
        }
        req.query.page = pageNum;
    }

    // Kiểm tra giới hạn
    if (limit !== undefined) {
        const limitNum = parseInt(limit);
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
            return res.status(400).json({
                success: false,
                message: "Giới hạn phải từ 1 đến 100"
            });
        }
        req.query.limit = limitNum;
    }

    // Kiểm tra trạng thái đã đọc
    if (is_read !== undefined && is_read !== 'true' && is_read !== 'false') {
        return res.status(400).json({
            success: false,
            message: "Tham số is_read phải là 'true' hoặc 'false'"
        });
    }

    // Kiểm tra trạng thái thông báo
    if (status !== undefined) {
        const validStatuses = ['draft', 'sent', 'archived'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Trạng thái phải là: draft, sent, archived"
            });
        }
    }

    next();
};

/**
 * Middleware kiểm tra tính hợp lệ của ObjectId
 */
const validateObjectId = (paramName) => {
    return (req, res, next) => {
        const id = req.params[paramName];

        if (!id || typeof id !== 'string' || id.length !== 24) {
            return res.status(400).json({
                success: false,
                message: `${paramName} không hợp lệ`
            });
        }

        next();
    };
};

module.exports = {
    validateTitle,
    validateContent,
    validateNotificationContent,
    validatePagination,
    validateObjectId
};
