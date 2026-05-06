const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Login
router.get('/login', authController.login_get);
router.post('/login', authLimiter, authController.login_post);

// Request Account
router.get('/request-account', authController.requestAccount_get);
router.post('/request-account', authController.requestAccount_post);

// Forgot Password
router.get('/forgot-password', authController.forgotPassword_get);
router.post('/forgot-password', authLimiter, authController.forgotPassword_post);

// Reset Password
router.get('/reset-password/:token', authController.resetPassword_get);
router.post('/reset-password', authController.resetPassword_post);

// Logout
router.get('/logout', authController.logout_get);

module.exports = router;

