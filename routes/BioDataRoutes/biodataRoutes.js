const express = require('express');
const { 
  createBiodata, 
  createBiodataForm,
  updateBiodata, 
  getBiodata, 
  getAllBiodatas,
  checkUserBiodata
} = require('../../controllers/BioDataContollers/vyavahikBiodataController');
const { 
  createBiodataPaymentOrder,
  verifyBiodataPayment,
  completeBiodataRegistration
} = require('../../controllers/PaymentControllers/paymentController');
const upload = require('../../middlewares/uploadMiddleware');
const { authMiddleware } = require('../../middlewares/authMiddlewares');
const router = express.Router();

// Enable authentication for all routes
router.use(authMiddleware);

// Check if user has a biodata
router.get('/check-status', checkUserBiodata);

// New payment flow routes
router.post('/create-form', upload.biodataImageUpload, createBiodataForm);
router.post('/create-payment', createBiodataPaymentOrder);
router.post('/verify-payment', verifyBiodataPayment);
router.post('/complete-registration/:orderId', upload.biodataImageUpload, completeBiodataRegistration);

// Legacy direct creation route (to be deprecated)
router.post('/', upload.biodataImageUpload, createBiodata);

// Update a biodata by ID
router.put('/:id', updateBiodata);

// Get a single biodata by ID
router.get('/:id', getBiodata);

// Get all biodatas
router.get('/', getAllBiodatas);

module.exports = router;
