/**
 * Upload Routes
 * Định nghĩa routes cho upload ảnh
 */
const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/upload.controller');
const { authenticate } = require('../../authentication/middlewares/authenticate');

/**
 * Upload single image
 * POST /api/upload/image
 * Body (multipart/form-data): { image: File }
 */
router.post('/image', authenticate, uploadController.uploadImage);

/**
 * Upload multiple images
 * POST /api/upload/images
 * Body (multipart/form-data): { images: File[] }
 */
router.post('/images', authenticate, uploadController.uploadMultipleImages);

module.exports = router;
