const multer = require('multer');
const multerS3 = require('multer-s3');
const { s3Client } = require('../config/s3Config');
const path = require('path');
const sharp = require('sharp');

// File type validation
const allowedTypes = new Set([
  'image/jpeg', 
  'image/jpg', 
  'image/png', 
  'application/pdf',
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo'
]);

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'groupIcon') {
    // Stricter validation for group icons
    if (['image/jpeg', 'image/png'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG and PNG files are allowed for group icons'));
    }
    return;
  }
  
  // Other file types...
  if (allowedTypes.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  }
};

// Determine folder based on file field name
const getS3Folder = (fieldname) => {
  switch(fieldname) {
    case 'profilePicture':
      return 'profile-pictures/';
    case 'panCard':
      return 'documents/pan-cards/';
    case 'aadharCard':
      return 'documents/aadhar-cards/';
    case 'userProfile':
      return 'documents/user-profiles/';
    case 'chatImage':
      return 'chat-media/images/';
    case 'groupImage':
      return 'groups/images/';
    case 'image': // For posts
      return 'posts/images/';
    case 'video': // For posts
      return 'posts/videos/';
    case 'media': // For stories
      return 'stories/';
    default:
      return 'others/';
  }
};

// Configure multer with S3
const upload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: process.env.AWS_BUCKET_NAME,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      // Get folder based on file field name
      const folder = getS3Folder(file.fieldname);
      
      // Create unique filename with timestamp and random string
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const filename = uniqueSuffix + path.extname(file.originalname);
      
      // Full S3 key with folder path
      const fullPath = folder + filename;
      
      cb(null, fullPath);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB file size limit
    files: 10 // Maximum 10 files per upload
  },
  fileFilter: fileFilter
});

// Error handling middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Maximum is 10 files.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  next();
};

// Add this to the multer configuration
const optimizeImage = async (req, res, next) => {
  if (!req.file || !['profilePicture', 'chatImage', 'groupIcon', 'image', 'media'].includes(req.file.fieldname)) return next();

  try {
    const optimized = await sharp(req.file.buffer)
      .resize(800, 800, { // Standard size for images
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 80 }) // Compress and convert to JPEG
      .toBuffer();

    req.file.buffer = optimized;
    next();
  } catch (error) {
    next(error);
  }
};

// Export specific upload configurations
module.exports = upload;
module.exports.handleMulterError = handleMulterError;
module.exports.chatImageUpload = [upload.single('chatImage'), optimizeImage];
module.exports.jainAadharDocs = upload.fields([
  { name: 'panCard', maxCount: 1 },
  { name: 'aadharCard', maxCount: 1 },
  { name: 'userProfile', maxCount: 1 }
]);
module.exports.storyUpload = [upload.array('media', 10), optimizeImage];
module.exports.postMediaUpload = [upload.fields([
  { name: 'image', maxCount: 10 },
  { name: 'video', maxCount: 10 }
]), optimizeImage];
module.exports.optimizeGroupIcon = optimizeImage;