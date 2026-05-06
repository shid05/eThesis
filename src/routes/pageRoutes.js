const express = require('express');
const router = express.Router();
const pageController = require('../controllers/pageController');
const adminController = require('../controllers/adminController');
const Notification = require('../models/Notification');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');

// ===== Page routes =====
router.get('/', pageController.index);
router.get('/about', pageController.about);
router.get('/help', pageController.help);
router.get('/contact', pageController.contact);
router.get('/profile', ensureAuthenticated, pageController.profile);

// ===== Public API routes =====
router.get('/session-info', pageController.sessionInfo);
router.get('/api/stats', pageController.getStats);
router.get('/api/active-users', pageController.getActiveUsers);
router.get('/api/test', pageController.testEndpoint);

// ===== Profile API routes =====
router.post('/api/profile/update-name', ensureAuthenticated, pageController.updateName);
router.post('/api/profile/upload-picture', ensureAuthenticated, pageController.upload.single('profilePicture'), pageController.uploadPicture);
router.post('/api/profile/change-password', ensureAuthenticated, pageController.changePassword);

// ===== Admin API routes (kept at root level to match frontend fetch URLs) =====
router.get('/api/dashboard-stats', ensureAuthenticated, ensureRole('Admin'), adminController.dashboardStats);
router.get('/api/recent-activity', ensureAuthenticated, ensureRole('Admin'), adminController.recentActivity);
router.get('/api/system/health', ensureAuthenticated, ensureRole('Admin'), adminController.systemHealth);
router.get('/api/admin/users', ensureAuthenticated, ensureRole('Admin'), adminController.usersApi);
router.patch('/api/admin/users/role', ensureAuthenticated, ensureRole('Admin'), adminController.updateRole);
router.delete('/api/admin/users/:userId', ensureAuthenticated, ensureRole('Admin'), adminController.deleteUser);
router.get('/api/admin/recently-approved', ensureAuthenticated, ensureRole('Admin'), adminController.recentApproved);
router.get('/api/admin/badge-counts', ensureAuthenticated, ensureRole('Admin'), adminController.badgeCounts);
router.get('/api/admin/account-requests', ensureAuthenticated, ensureRole('Admin'), adminController.accountRequestsApi);
router.post('/api/admin/account-requests/:requestId/approve', ensureAuthenticated, ensureRole('Admin'), adminController.approveRequest);
router.post('/api/admin/account-requests/:requestId/reject', ensureAuthenticated, ensureRole('Admin'), adminController.rejectRequest);
router.get('/api/admin/email-settings', ensureAuthenticated, ensureRole('Admin'), adminController.getEmailSettings);
router.post('/api/admin/email-settings', ensureAuthenticated, ensureRole('Admin'), adminController.saveEmailSettings);
router.post('/api/admin/email-settings/test', ensureAuthenticated, ensureRole('Admin'), adminController.testEmail);
router.get('/api/thesis/recent-approved', ensureAuthenticated, ensureRole('Admin'), adminController.recentApprovedTheses);
router.get('/api/thesis/recent', ensureAuthenticated, ensureRole('Admin'), adminController.recentTheses);
router.get('/api/reviews/recent', ensureAuthenticated, ensureRole('Admin'), adminController.recentReviews);

// ===== Admin Account Retrieval API routes =====
router.get('/api/admin/account-retrievals', ensureAuthenticated, ensureRole('Admin'), adminController.accountRetrievalsApi);
router.post('/api/admin/account-retrievals/:requestId/approve', ensureAuthenticated, ensureRole('Admin'), adminController.approveRetrieval);
router.post('/api/admin/account-retrievals/:requestId/reject', ensureAuthenticated, ensureRole('Admin'), adminController.rejectRetrieval);

// =============================================================
// Notification Feed API — persistent, per-user notifications
// =============================================================

// GET /api/notifications — fetch the user's notification feed (newest first)
router.get('/api/notifications', ensureAuthenticated, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const items = await Notification.find({ userId: req.session.user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(items);
  } catch (err) {
    console.error('GET /api/notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// POST /api/notifications/:id/read — mark a single notification as read
router.post('/api/notifications/:id/read', ensureAuthenticated, async (req, res) => {
  try {
    await Notification.updateOne(
      { _id: req.params.id, userId: req.session.user.id },
      { $set: { read: true } }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/notifications/:id/read error:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// POST /api/notifications/read-all — mark every notification as read
router.post('/api/notifications/read-all', ensureAuthenticated, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.session.user.id, read: false },
      { $set: { read: true } }
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/notifications/read-all error:', err);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// DELETE /api/notifications/clear — remove all notifications for this user
router.delete('/api/notifications/clear', ensureAuthenticated, async (req, res) => {
  try {
    await Notification.deleteMany({ userId: req.session.user.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/notifications/clear error:', err);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

module.exports = router;
