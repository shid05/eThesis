const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');

// Add review (Teacher and Admin only)
router.get('/add/:thesisId', ensureAuthenticated, ensureRole('Teacher', 'Admin'), reviewController.add_get);
router.post('/add/:thesisId', ensureAuthenticated, ensureRole('Teacher', 'Admin'), reviewController.add_post);

// Edit review (Teacher and Admin only)
router.get('/edit/:thesisId', ensureAuthenticated, ensureRole('Teacher', 'Admin'), reviewController.edit_get);
router.post('/edit/:thesisId', ensureAuthenticated, ensureRole('Teacher', 'Admin'), reviewController.edit_post);

// API: get existing review for editing (Teacher and Admin only)
router.get('/api/edit/:thesisId', ensureAuthenticated, ensureRole('Teacher', 'Admin'), reviewController.editApi);

module.exports = router;
