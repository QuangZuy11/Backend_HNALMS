/**
 * Upload Routes
 * Định nghĩa routes cho upload ảnh
 */
const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/upload.controller');
const { authenticate } = require('../../authentication/middlewares/authenticate');
const fileUpload = require('express-fileupload');

const uploadMiddleware = fileUpload({
    useTempFiles: true,
    tempFileDir: '/tmp/',
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    abortOnLimit: true,
    createParentPath: true
});

/**
 * Upload single image
 * POST /api/upload/image
 * Body (multipart/form-data): { image: File }
 */
router.post('/image', authenticate, uploadMiddleware, uploadController.uploadImage);

/**
 * Upload multiple images
 * POST /api/upload/images
 * Body (multipart/form-data): { images: File[] }
 */
router.post('/images', authenticate, uploadMiddleware, uploadController.uploadMultipleImages);

module.exports = router;
