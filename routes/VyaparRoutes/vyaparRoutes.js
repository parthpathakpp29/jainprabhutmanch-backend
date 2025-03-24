const express = require('express');
const router = express.Router();
const { 
    submitVyaparApplication,
    getPendingApplications,
    reviewApplication,
    vyaparLogin,
    getVyaparDetails,
    updateVyaparDetails,
    getCityVyapars,
    getAvailableCities,
    getAllVyapars
} = require('../../controllers/VyaparControllers/vyaparController');
const { authMiddleware, verifyVyaparRole } = require('../../middlewares/authMiddlewares');
const { canReviewBusiness } = require('../../middlewares/vyaparAuthMiddleware');
const upload = require('../../middlewares/uploadMiddleware');

// Public routes
router.get('/available-cities', getAvailableCities);
router.get('/city/:citySanghId', getCityVyapars);
router.get('/', getAllVyapars);

// Protected routes - require user authentication
router.use(authMiddleware);

// Vyapar access route - uses JWT token now
router.get('/access/:vyaparId', verifyVyaparRole, vyaparLogin);

// Application routes
router.post('/apply', 
    upload.vyaparDocs,
    submitVyaparApplication
);

// City Sangh president routes
router.get('/pending/:citySanghId', 
    canReviewBusiness,
    getPendingApplications
);

router.put('/review/:vyaparId',
    canReviewBusiness,
    reviewApplication
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
