const express = require('express');
const router = express.Router();
const { getAllPayments } = require('../../controllers/PaymentControllers/paymentController');
const { authMiddleware, isAdmin } = require('../../middlewares/authMiddlewares');

// Admin route to fetch all payments
router.get('/', authMiddleware, isAdmin, getAllPayments);

module.exports = router;