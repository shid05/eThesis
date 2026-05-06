const express = require('express');
const router = express.Router();
const thesisController = require('../controllers/thesisController');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');

// Upload
router.get('/upload', ensureAuthenticated, ensureRole('Student'), thesisController.upload_get);
router.post('/upload', ensureAuthenticated, ensureRole('Student'), thesisController.upload.single('thesisFile'), thesisController.upload_post);

// My submissions
router.get('/mine', ensureAuthenticated, ensureRole('Student'), thesisController.myTheses);
router.get('/api/mine', ensureAuthenticated, ensureRole('Student'), thesisController.myThesesApi);

// All approved thesis (public)
router.get('/', thesisController.allApproved);
router.get('/api', thesisController.allApprovedApi);

// List of teachers (used to populate the Adviser dropdown on upload/edit)
// MUST be registered before /api/:id to avoid being shadowed by the catch-all.
router.get('/api/teachers', ensureAuthenticated, thesisController.teachersApi);

// Thesis detail (must be after specific routes to avoid catch-all)
router.get('/:id', thesisController.detail);
router.get('/api/:id', thesisController.detailApi);

// Download the PDF (fetches resource details from Cloudinary, then streams it back as an attachment)
router.get('/:id/download', ensureAuthenticated, thesisController.download_get);

// Teacher review queue
router.get('/reviewer/pending', ensureAuthenticated, ensureRole('Teacher'), thesisController.reviewerPending);
router.get('/api/reviewer/pending', ensureAuthenticated, ensureRole('Teacher'), thesisController.reviewerPendingApi);

// Admin pending queue
router.get('/admin/pending', ensureAuthenticated, ensureRole('Admin'), thesisController.adminPending);
router.get('/api/admin/pending', ensureAuthenticated, ensureRole('Admin'), thesisController.adminPendingApi);

// Edit thesis (author only)
router.get('/edit/:id', ensureAuthenticated, thesisController.edit_get);
router.post('/edit/:id', ensureAuthenticated, thesisController.upload.single('thesisFile'), thesisController.edit_post);

// Delete thesis (author only)
router.post('/delete/:id', ensureAuthenticated, thesisController.delete_post);

// Approve / Reject
router.post('/:id/approve', ensureAuthenticated, ensureRole('Teacher', 'Admin'), thesisController.approve_post);
router.post('/:id/reject', ensureAuthenticated, ensureRole('Teacher', 'Admin'), thesisController.reject_post);

// Revoke approval (Admin or Adviser)
router.post('/admin/:id/revoke', ensureAuthenticated, ensureRole('Teacher', 'Admin'), thesisController.revoke_post);

module.exports = router;
