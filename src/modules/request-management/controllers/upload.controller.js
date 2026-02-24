/**
 * Upload Controller
 * Xử lý upload ảnh lên Cloudinary
 */
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// Cấu hình Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

/**
 * Upload single image to Cloudinary
 * POST /api/upload/image
 */
exports.uploadImage = async (req, res) => {
  try {
    console.log('=== Upload Image Request ===');
    
    // Kiểm tra file có tồn tại không
    if (!req.files || !req.files.image) {
      return res.status(400).json({ 
        success: false,
        message: 'Không có file ảnh được gửi lên' 
      });
    }

    const file = req.files.image;
    
    console.log('File info:', {
      name: file.name,
      size: file.size,
      mimetype: file.mimetype
    });

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Chỉ chấp nhận file ảnh (JPEG, PNG, WebP, GIF)'
      });
    }

    // Upload lên Cloudinary
    const result = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: 'repair_requests',
      resource_type: 'auto',
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' }, // Giới hạn kích thước
        { quality: 'auto' } // Tự động tối ưu chất lượng
      ]
    });

    console.log('Upload successful:', result.secure_url);

    res.json({
      success: true,
      message: 'Upload ảnh thành công',
      data: {
        url: result.secure_url,
        publicId: result.public_id
      }
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ 
      success: false,
      message: 'Không thể tải ảnh lên',
      error: error.message 
    });
  }
};

/**
 * Upload multiple images to Cloudinary
 * POST /api/upload/images
 */
exports.uploadMultipleImages = async (req, res) => {
  try {
    console.log('=== Upload Multiple Images Request ===');
    
    if (!req.files || !req.files.images) {
      return res.status(400).json({ 
        success: false,
        message: 'Không có file ảnh được gửi lên' 
      });
    }

    // Lấy array các files
    let files = req.files.images;
    
    // Nếu chỉ có 1 file, biến thành array
    if (!Array.isArray(files)) {
      files = [files];
    }

    console.log(`Uploading ${files.length} images...`);

    // Validate số lượng
    if (files.length > 10) {
      return res.status(400).json({
        success: false,
        message: 'Không được upload quá 10 ảnh cùng lúc'
      });
    }

    // Validate file types
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    const invalidFiles = files.filter(f => !allowedTypes.includes(f.mimetype));
    
    if (invalidFiles.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Chỉ chấp nhận file ảnh (JPEG, PNG, WebP, GIF)'
      });
    }

    // Upload từng file
    const uploadPromises = files.map(async (file) => {
      try {
        const result = await cloudinary.uploader.upload(file.tempFilePath, {
          folder: 'repair_requests',
          resource_type: 'auto',
          transformation: [
            { width: 1200, height: 1200, crop: 'limit' },
            { quality: 'auto' }
          ]
        });
        
        return {
          success: true,
          url: result.secure_url,
          publicId: result.public_id
        };
      } catch (error) {
        console.error('Error uploading file:', error);
        return {
          success: false,
          error: error.message
        };
      }
    });

    const results = await Promise.all(uploadPromises);
    
    // Lọc các upload thành công
    const successfulUploads = results.filter(r => r.success);
    const failedUploads = results.filter(r => !r.success);

    console.log(`Upload completed: ${successfulUploads.length}/${files.length} successful`);

    res.json({
      success: true,
      message: `Upload thành công ${successfulUploads.length}/${files.length} ảnh`,
      data: {
        urls: successfulUploads.map(r => r.url),
        publicIds: successfulUploads.map(r => r.publicId),
        total: files.length,
        successful: successfulUploads.length,
        failed: failedUploads.length
      }
    });
  } catch (error) {
    console.error('Error uploading multiple images:', error);
    res.status(500).json({ 
      success: false,
      message: 'Không thể tải ảnh lên',
      error: error.message 
    });
  }
};
