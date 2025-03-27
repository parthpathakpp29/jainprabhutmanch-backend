const express = require('express');
const router = express.Router();
const { 
    submitVyaparApplication,
    vyaparLogin,
    getVyaparDetails,
    updateVyaparDetails,
    getCityVyapars,
    getAvailableCities,
    getAllVyapars
} = require('../../controllers/VyaparControllers/vyaparController');
const { 
    createVyaparPaymentOrder,
    verifyVyaparPayment,
    completeVyaparRegistration
} = require('../../controllers/PaymentControllers/paymentController');
const { authMiddleware, verifyVyaparRole } = require('../../middlewares/authMiddlewares');
const upload = require('../../middlewares/uploadMiddleware');

// Public routes
router.get('/available-cities', getAvailableCities);
router.get('/city/:citySanghId', getCityVyapars);
router.get('/', getAllVyapars);

// Protected routes - require user authentication
router.use(authMiddleware);

// Vyapar access route - uses JWT token now
router.get('/access/:vyaparId', verifyVyaparRole, vyaparLogin);

// Payment and registration flow
router.post('/create-payment', createVyaparPaymentOrder);
router.post('/verify-payment', verifyVyaparPayment);
router.post('/complete-registration/:orderId', 
    upload.vyaparDocs,
    completeVyaparRegistration
);

// Legacy direct creation route - keeping for backward compatibility
// Consider deprecating this in the future
router.post('/create', 
    upload.vyaparDocs,
    submitVyaparApplication
);

// Business viewing routes
router.get('/details/:vyaparId',
    verifyVyaparRole,
    getVyaparDetails
);

// Business management routes - require business owner role
router.put('/update/:vyaparId',
    verifyVyaparRole,
    upload.vyaparDocs,
    updateVyaparDetails
);

module.exports = router;
