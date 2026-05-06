const express = require('express');
const router = express.Router();
const studentRatingController = require('../controllers/studentRatingController');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');

// Add rating
router.get('/add/:thesisId', ensureAuthenticated, ensureRole('Student'), studentRatingController.add_get);
router.post('/add/:thesisId', ensureAuthenticated, ensureRole('Student'), studentRatingController.add_post);

// Edit rating
router.get('/edit/:thesisId', ensureAuthenticated, ensureRole('Student'), studentRatingController.edit_get);
router.post('/edit/:thesisId', ensureAuthenticated, ensureRole('Student'), studentRatingController.edit_post);

// API: get ratings for a thesis (public)
router.get('/api/:thesisId', studentRatingController.ratingsApi);

// API: get existing rating for editing
router.get('/api/edit/:thesisId', ensureAuthenticated, ensureRole('Student'), studentRatingController.editApi);

module.exports = router;
