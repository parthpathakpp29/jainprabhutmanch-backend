const multer = require('multer');
const multerS3 = require('multer-s3');
const s3Client = require('../config/s3Config');
const path = require('path');

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
  if (allowedTypes.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, JPG, PNG, PDF, and video files are allowed.'), false);
  }
};

// Folder mapping based on fieldname
const folderMapping = {
  profilePicture: 'profile-pictures',
  panCard: 'pan-cards',
  aadharCard: 'aadhar-cards',
  userProfile: 'user-profiles',
  media: 'stories',
  image: 'posts' // Added folder for post images
};

// Configure multer-s3
const s3Storage = multerS3({
  s3: s3Client,
  bucket: process.env.AWS_BUCKET_NAME,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  key: (req, file, cb) => {
    const userId = req.user ? req.user._id : 'unregistered';
    const timestamp = Date.now();
    const folder = folderMapping[file.fieldname] || 'others';
    const filename = `${userId}-${timestamp}${path.extname(file.originalname)}`;
    cb(null, `${folder}/${filename}`);
  },
});

// Create multer instance
const upload = multer({
  storage: s3Storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for videos
  },
});

// Export the multer instance and specific configurations
module.exports = {
  single: upload.single.bind(upload),
  array: upload.array.bind(upload),
  fields: upload.fields.bind(upload),
  none: upload.none.bind(upload),
  jainAadharDocs: upload.fields([
    { name: 'panCard', maxCount: 1 },
    { name: 'aadharCard', maxCount: 1 },
    { name: 'userProfile', maxCount: 1 }
  ]),
  storyUpload: upload.array('media', 10) 
};