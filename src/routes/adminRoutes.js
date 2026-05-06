const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');

// All admin routes require authentication + Admin role
router.use(ensureAuthenticated, ensureRole('Admin'));

// Page routes (mounted at /admin, so /admin/dashboard, /admin/users, etc.)
router.get('/dashboard', adminController.dashboard);
router.get('/users', adminController.users_get);
router.get('/reports', adminController.reports);
router.get('/account-requests', adminController.accountRequests);
router.get('/email-settings', adminController.emailSettings);

module.exports = router;
