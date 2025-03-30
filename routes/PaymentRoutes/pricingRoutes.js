const express = require('express');
const router = express.Router();
const { updatePrice, getPrices } = require('../../controllers/PaymentControllers/pricingController');
const { authMiddleware, isAdmin } = require('../../middlewares/authMiddlewares');

// Admin routes - require admin privileges
router.get('/', authMiddleware, isAdmin, getPrices);
router.put('/', authMiddleware, isAdmin, updatePrice);

module.exports = router;
