const { body, param, query, check } = require('express-validator');

// Jain Aadhar Validation
const jainAadharValidation = [
  body('name').notEmpty().trim().withMessage('Name is required'),
  body('pitaOrpatiName').notEmpty().trim().withMessage('Father/Husband name is required'),
  body('gender').isIn(['Male', 'Female']).withMessage('Invalid gender'),
  body('dob').notEmpty().withMessage('Date of birth is required'),
  body('contactDetails.email').isEmail().withMessage('Invalid email address'),
  body('contactDetails.number').matches(/^\d{10}$/).withMessage('Invalid phone number'),
];

//  Registration Validation
const userValidation = {
  register: [
    body('firstName').notEmpty().trim().escape()
      .isLength({ min: 2, max: 30 }).withMessage('First name must be between 2 and 30 characters'),
    body('lastName').notEmpty().trim().escape()
      .isLength({ min: 2, max: 30 }).withMessage('Last name must be between 2 and 30 characters'),
    body('email').isEmail().withMessage('A valid email is required'),
    body('phoneNumber').matches(/^\d{10}$/).withMessage('Phone number must be 10 digits'),
    body('password')
      .isLength({ min: 8 })
      .matches(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*])/)
      .withMessage('Password must contain at least 8 characters, one uppercase, one lowercase, one number, and one special character'),
    body('birthDate').isISO8601().withMessage('Invalid date format'),
    body('gender').isIn(['Male', 'Female', 'Other']).withMessage('Invalid gender value'),
    body('city').notEmpty().trim().escape(),
    body('state').notEmpty().trim().escape(),
    body('district').notEmpty().trim().escape()
  ],

  login: [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],

  verifyEmail: [
    body('email').isEmail().withMessage('Email is required'),
    body('code').isLength({ min: 6, max: 6 }).withMessage('Verification code must be 6 digits')
  ],

  resendCode: [
    body('email').isEmail().withMessage('Email is required')
  ],

  requestPasswordReset: [
    body('email').isEmail().withMessage('Email is required')
  ],

  resetPassword: [
    body('email').isEmail().withMessage('Email is required'),
    body('code').isLength({ min: 6, max: 6 }).withMessage('Reset code must be 6 digits'),
    body('newPassword')
      .isLength({ min: 8 })
      .matches(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*])/)
      .withMessage('Password must contain at least 8 characters, one uppercase, one lowercase, one number, and one special character')
  ]
};



// Post Validation
const postValidation = {
  create: [
    body('caption').optional().isString().isLength({ max: 500 }).withMessage('Caption must be a string with a maximum length of 500 characters')
  ],
  edit: [
    param('postId').notEmpty().isMongoId().withMessage('Post ID is required and must be a valid Mongo ID'),
    body('caption').optional().isString().isLength({ max: 500 }).withMessage('Caption must be a string with a maximum length of 500 characters')
  ],
  comment: [
    body('postId').notEmpty().isMongoId().withMessage('Post ID is required and must be a valid Mongo ID'),
    body('commentText').notEmpty().isString().withMessage('Comment text is required and must be a string')
  ],
  reply: [
    body('commentId').notEmpty().isMongoId().withMessage('Comment ID is required and must be a valid Mongo ID'),
    body('replyText').notEmpty().isString().withMessage('Reply text is required and must be a string')
  ],
  toggleLike: [
    param('postId').notEmpty().isMongoId().withMessage('Post ID is required and must be a valid Mongo ID')
  ],
  delete: [
    param('postId').notEmpty().isMongoId().withMessage('Post ID is required and must be a valid Mongo ID')
  ],
  getPostsByUser: [
    param('userId').notEmpty().isMongoId().withMessage('User ID is required and must be a valid Mongo ID')
  ],
  getPostById: [
    param('postId').notEmpty().isMongoId().withMessage('Post ID is required and must be a valid Mongo ID')
  ],
  getReplies: [
    param('commentId').notEmpty().isMongoId().withMessage('Comment ID is required and must be a valid Mongo ID')
  ]
};

module.exports = {
  jainAadharValidation,
  userValidation,
  postValidation
};