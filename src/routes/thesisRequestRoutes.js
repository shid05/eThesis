const express = require('express');
const router = express.Router();
const { submitRequest, approveRequest, listRequests } = require('../controllers/thesisRequestController');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');

// Submit a file request (authenticated users only)
router.post('/api/thesis-requests', ensureAuthenticated, submitRequest);

// Approve via email token (no auth — token acts as credential)
router.get('/thesis-requests/approve/:token', approveRequest);

// Admin list all file requests
router.get('/api/admin/thesis-requests', ensureAuthenticated, ensureRole('Admin'), listRequests);

module.exports = router;
