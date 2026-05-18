const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Thesis = require('../models/Thesis');
const User = require('../models/User');
const AccountRequest = require('../models/AccountRequest');
const AccountRetrieval = require('../models/AccountRetrieval');
const EmailSettings = require('../models/EmailSettings');
const ThesisRequest = require('../models/ThesisRequest');
const { sendAccountDetailsEmail, sendPasswordResetEmail } = require('../utils/emailService');
const { getBadgeCounts, emitBadgeCounts } = require('../utils/badgeCounts');
const { createNotification, createNotificationForMany } = require('../utils/notificationHelper');

// GET /admin/dashboard
const dashboard = (req, res) => {
  res.render('admin_dashboard');
};

// GET /admin/users
const users_get = (req, res) => {
  res.render('admin_users');
};

// GET /admin/reports
const reports = (req, res) => {
  res.render('admin_reports');
};

// GET /admin/account-requests
const accountRequests = (req, res) => {
  res.render('admin_account_requests');
};

// GET /admin/email-settings
const emailSettings = (req, res) => {
  res.render('admin_email_settings');
};

// GET /api/admin/badge-counts
// Lightweight endpoint used by the navbar to populate notification badges
// (pending theses + pending account requests) on first page load.
const badgeCounts = async (req, res) => {
  try {
    const counts = await getBadgeCounts();
    res.json(counts);
  } catch (error) {
    console.error('Error fetching badge counts:', error);
    res.status(500).json({ error: 'Failed to fetch badge counts' });
  }
};

// GET /api/dashboard-stats
const dashboardStats = async (req, res) => {
  try {
    const [totalTheses, pendingTheses, approvedTheses, totalUsers, totalRequests, pendingFileRequests] = await Promise.all([
      Thesis.countDocuments(),
      Thesis.countDocuments({ status: 'Pending' }),
      Thesis.countDocuments({ status: 'Approved' }),
      User.countDocuments(),
      AccountRequest.countDocuments({ status: 'Pending' }),
      ThesisRequest.countDocuments({ status: 'pending' })
    ]);

    res.json({
      totalTheses,
      pendingTheses,
      approvedTheses,
      rejectedTheses: totalTheses - pendingTheses - approvedTheses,
      totalUsers,
      totalRequests,
      pendingFileRequests,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
};

// GET /api/recent-activity
const recentActivity = async (req, res) => {
  try {
    const [recentTheses, recentFileRequests] = await Promise.all([
      Thesis.find()
        .populate('author', 'name')
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title status createdAt author'),
      ThesisRequest.find({ status: 'pending' })
        .populate('thesis', 'title')
        .populate('requester', 'name')
        .sort({ createdAt: -1 })
        .limit(5)
        .select('status createdAt thesis requester')
    ]);

    res.json({
      recentTheses,
      recentFileRequests,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({ error: 'Failed to fetch recent activity' });
  }
};

// GET /api/admin/users
const usersApi = async (req, res) => {
  try {
    const users = await User.find({})
      .select('name email role createdAt')
      .sort({ createdAt: -1 });

    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const thesesCount = await Thesis.countDocuments({ author: user._id });

        return {
          ...user.toObject(),
          thesesCount,
          lastLogin: user.updatedAt
        };
      })
    );

    res.json(usersWithStats);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// POST /api/admin/users/role
const updateRole = async (req, res) => {
  try {
    const { userId, role } = req.body;

    if (!userId || !role) {
      return res.status(400).json({ error: 'User ID and role are required' });
    }

    if (!['Student', 'Teacher', 'Admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role specified' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true }
    ).select('name email role');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Notify the user of their role change
    await createNotification(req.io, user._id, {
      type: 'info',
      title: 'Role Updated',
      message: `Your account role has been updated to ${role} by an administrator.`,
      link: '/profile'
    });

    // Patch the role in every active session for this user so the next
    // request they make reflects the new role without requiring re-login.
    try {
      const sessionCollection = mongoose.connection.db.collection('sessions');
      await sessionCollection.updateMany(
        { 'session.user.id': userId },
        { $set: { 'session.user.role': role } }
      );
    } catch (sessionErr) {
      console.error('Failed to patch sessions for role change:', sessionErr.message);
    }

    // Force an immediate reload for the affected user if they are online.
    req.io.to(userId).emit('role-updated', { role });

    console.log(`✅ User role updated: ${user.name} -> ${role} by admin`);
    res.json({ message: 'User role updated successfully', user });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
};

// DELETE /api/admin/users/:userId
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.session.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify the admin's own password before allowing deletion
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required to delete a user' });
    }
    const admin = await User.findById(req.session.user.id).select('password');
    const isValid = admin && await bcrypt.compare(password, admin.password);
    if (!isValid) {
      return res.status(403).json({ error: 'Incorrect password. Deletion cancelled.' });
    }

    await Promise.all([
      Thesis.deleteMany({ author: userId }),
      ThesisRequest.deleteMany({ requester: userId })
    ]);

    await User.findByIdAndDelete(userId);

    // Kick active browser tab via Socket.IO
    req.io.to(userId).emit('force-logout');

    // Destroy all server-side sessions for the deleted user.
    // Direct MongoDB query used because connect-mongo v5 store.all() returns
    // an array (not an object), making the old sessionId iteration unreliable.
    try {
      const sessionCollection = mongoose.connection.db.collection('sessions');
      await sessionCollection.deleteMany({ 'session.user.id': userId });
    } catch (sessionErr) {
      console.error('Failed to purge sessions for deleted user:', sessionErr.message);
    }

    // Notify all other admins about the deletion
    const otherAdmins = await User.find({
      role: 'Admin',
      _id: { $ne: req.session.user.id }
    }).select('_id').lean();
    const otherAdminIds = otherAdmins.map(a => a._id);
    if (otherAdminIds.length > 0) {
      await createNotificationForMany(req.io, otherAdminIds, {
        type: 'warning',
        title: 'User Deleted',
        message: `Admin ${req.session.user.name} deleted user "${user.name}" (${user.role}).`,
        link: '/admin/users'
      });
    }

    console.log(`🗑️ User deleted: ${user.name} by admin ${req.session.user.name}`);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// GET /api/admin/recently-approved
const recentApproved = async (req, res) => {
  try {
    const recentlyApproved = await Thesis.find({ status: 'Approved' })
      .populate('author', 'name email')
      .sort({ updatedAt: -1 })
      .limit(5);

    res.json(recentlyApproved);
  } catch (error) {
    console.error('Error fetching recently approved theses:', error);
    res.status(500).json({ error: 'Failed to fetch recently approved theses' });
  }
};

// GET /api/admin/account-requests
const accountRequestsApi = async (req, res) => {
  try {
    const requests = await AccountRequest.find({ status: 'Pending' })
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error('❌ Error fetching account requests:', error);
    res.status(500).json({ error: 'Failed to fetch account requests' });
  }
};

// POST /api/admin/account-requests/:requestId/approve
const approveRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { password, notes } = req.body;
    
    const accountRequest = await AccountRequest.findById(requestId);
    if (!accountRequest) {
      return res.status(404).json({ error: 'Account request not found' });
    }
    
    if (accountRequest.status !== 'Pending') {
      return res.status(400).json({ error: 'This request has already been processed' });
    }
    
    const existingUser = await User.findOne({ email: accountRequest.email });
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }
    
    if (!password || password.trim().length < 6) {
      return res.status(400).json({ error: 'Password is required and must be at least 6 characters long' });
    }
    
    const userPassword = password.trim();
    
    const newUser = await User.create({
      name: accountRequest.name,
      email: accountRequest.email,
      password: userPassword,
      role: accountRequest.role
    });
    
    // Remove the request from the database after approval
    await AccountRequest.findByIdAndDelete(requestId);
    
    const emailResult = await sendAccountDetailsEmail(
      accountRequest.email,
      accountRequest.name,
      userPassword,
      accountRequest.role
    );
    
    // Create a persistent welcome notification
    await createNotification(req.io, newUser._id, {
      type: 'success',
      title: 'Welcome to eThesis!',
      message: `Your account request has been approved and you have been assigned the ${newUser.role} role.`,
      link: '/profile'
    });
    
    if (!emailResult.success) {
      console.error('⚠️ Account created but email failed to send:', emailResult.error);
    }
    
    console.log(`✅ Account request approved: ${accountRequest.name} (${accountRequest.email})`);

    // Sync admin navbar badges (pendingRequests--)
    emitBadgeCounts(req.io);

    res.json({ 
      message: 'Account created successfully and email sent',
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      },
      emailSent: emailResult.success
    });
  } catch (error) {
    console.error('Error approving account request:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ error: messages.join('. ') });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }
    
    res.status(500).json({ error: 'Failed to approve account request' });
  }
};

// POST /api/admin/account-requests/:requestId/reject
const rejectRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;
    
    const accountRequest = await AccountRequest.findById(requestId);
    if (!accountRequest) {
      return res.status(404).json({ error: 'Account request not found' });
    }
    
    if (accountRequest.status !== 'Pending') {
      return res.status(400).json({ error: 'This request has already been processed' });
    }
    
    // Remove the request from the database after rejection
    await AccountRequest.findByIdAndDelete(requestId);
    
    console.log(`❌ Account request rejected: ${accountRequest.name} (${accountRequest.email})`);

    // Sync admin navbar badges (pendingRequests--)
    emitBadgeCounts(req.io);

    res.json({ message: 'Account request rejected successfully' });
  } catch (error) {
    console.error('Error rejecting account request:', error);
    res.status(500).json({ error: 'Failed to reject account request' });
  }
};

// GET /api/admin/email-settings
const getEmailSettings = async (req, res) => {
  try {
    const settings = await EmailSettings.findById('email_settings');
    
    if (!settings) {
      return res.status(404).json({ error: 'Email settings not found' });
    }
    
    const settingsObj = settings.toObject();
    delete settingsObj.emailPassword;
    
    res.json(settingsObj);
  } catch (error) {
    console.error('Error fetching email settings:', error);
    res.status(500).json({ error: 'Failed to fetch email settings' });
  }
};

// POST /api/admin/email-settings
const saveEmailSettings = async (req, res) => {
  try {
    const { emailUser, emailPassword, smtpHost, smtpPort, smtpSecure } = req.body;
    
    if (!emailUser) {
      return res.status(400).json({ error: 'Email address is required' });
    }
    
    let settings = await EmailSettings.findById('email_settings');
    
    if (settings) {
      settings.emailUser = emailUser;
      if (emailPassword) {
        settings.emailPassword = emailPassword;
      }
      settings.smtpHost = smtpHost || settings.smtpHost;
      settings.smtpPort = smtpPort || settings.smtpPort;
      settings.smtpSecure = smtpSecure !== undefined ? smtpSecure : settings.smtpSecure;
      settings.configuredBy = req.session.user.id;
    } else {
      if (!emailPassword) {
        return res.status(400).json({ error: 'Password is required for new configuration' });
      }
      
      settings = new EmailSettings({
        _id: 'email_settings',
        emailUser,
        emailPassword,
        smtpHost: smtpHost || 'smtp-relay.brevo.com',
        smtpPort: smtpPort || 587,
        smtpSecure: smtpSecure || false,
        configuredBy: req.session.user.id
      });
    }
    
    await settings.save();
    
    console.log(`✅ Email settings configured by ${req.session.user.name}`);
    
    const settingsObj = settings.toObject();
    delete settingsObj.emailPassword;
    
    res.json({ 
      message: 'Email settings saved successfully',
      settings: settingsObj
    });
  } catch (error) {
    console.error('Error saving email settings:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ error: messages.join('. ') });
    }
    
    res.status(500).json({ error: 'Failed to save email settings' });
  }
};

// POST /api/admin/email-settings/test
const testEmail = async (req, res) => {
  try {
    // If Brevo API key is configured, test via HTTP API (no SMTP needed)
    if (process.env.BREVO_API_KEY) {
      const senderEmail = process.env.BREVO_SENDER_EMAIL || req.session.user.email;
      try {
        const apiRes = await fetch('https://api.brevo.com/v3/account', {
          headers: { 'api-key': process.env.BREVO_API_KEY }
        });
        if (!apiRes.ok) {
          const err = await apiRes.json().catch(() => ({}));
          return res.status(400).json({ error: `Brevo API key invalid: ${err.message || `HTTP ${apiRes.status}`}` });
        }
        const account = await apiRes.json();
        console.log(`✅ Brevo API key valid, account: ${account.email}`);
        return res.json({ success: true, message: `Brevo API connected. Account: ${account.email}` });
      } catch (apiErr) {
        return res.status(400).json({ error: `Brevo API test failed: ${apiErr.message}` });
      }
    }

    // Fallback: SMTP test
    const settings = await EmailSettings.findById('email_settings');
    if (!settings) {
      return res.status(404).json({ error: 'Email settings not found. Please configure email first.' });
    }
    const result = await settings.testConnection();
    if (result.success) {
      console.log(`✅ Email connection test successful`);
      res.json(result);
    } else {
      console.log(`❌ Email connection test failed: ${result.error}`);
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error testing email connection:', error);
    res.status(500).json({ error: 'Failed to test email connection' });
  }
};

// GET /api/thesis/recent-approved
const recentApprovedTheses = async (req, res) => {
  try {
    const recentlyApproved = await Thesis.find({ status: 'Approved' })
      .populate('author', 'name email')
      .sort({ updatedAt: -1 })
      .limit(5);

    res.json(recentlyApproved);
  } catch (error) {
    console.error('Error fetching recently approved theses:', error);
    res.status(500).json({ error: 'Failed to fetch recently approved theses' });
  }
};

// GET /api/thesis/recent
const recentTheses = async (req, res) => {
  try {
    const recent = await Thesis.find({})
      .populate('author', 'name email')
      .sort({ createdAt: -1 })
      .limit(5);

    res.json(recent);
  } catch (error) {
    console.error('Error fetching recent theses:', error);
    res.status(500).json({ error: 'Failed to fetch recent theses' });
  }
};

// GET /api/reviews/recent — deprecated, kept for backwards compat
const recentReviews = async (req, res) => {
  res.json([]);
};

// GET /api/system/health
const systemHealth = async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    
    res.json({
      database: dbStatus,
      uptime: Math.floor(uptime / 60),
      memory: {
        used: Math.round(memory.heapUsed / 1024 / 1024),
        total: Math.round(memory.heapTotal / 1024 / 1024)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking system health:', error);
    res.status(500).json({ error: 'Failed to check system health' });
  }
};

// ============================================================
// Account Retrieval (Forgot Password) — Admin API Endpoints
// ============================================================

// GET /api/admin/account-retrievals
const accountRetrievalsApi = async (req, res) => {
  try {
    const requests = await AccountRetrieval.find({ status: 'Pending' })
      .sort({ createdAt: -1 });

    res.json(requests);
  } catch (error) {
    console.error('❌ Error fetching account retrievals:', error);
    res.status(500).json({ error: 'Failed to fetch account retrieval requests' });
  }
};

// POST /api/admin/account-retrievals/:requestId/approve
const approveRetrieval = async (req, res) => {
  try {
    const { requestId } = req.params;

    const retrieval = await AccountRetrieval.findById(requestId);
    if (!retrieval) {
      return res.status(404).json({ error: 'Account retrieval request not found' });
    }

    if (retrieval.status !== 'Pending') {
      return res.status(400).json({ error: 'This request has already been processed' });
    }

    // Find the matching user
    const user = await User.findById(retrieval.userId);
    if (!user) {
      return res.status(400).json({ error: 'Associated user account not found' });
    }

    // Generate a secure reset token
    const rawToken = retrieval.generateResetToken();
    retrieval.status = 'Approved';
    retrieval.processedBy = req.session.user.id;
    retrieval.processedAt = new Date();
    await retrieval.save();

    // Build the reset URL using the provided ngrok domain or dynamic host
    const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    const resetUrl = `${appUrl}/reset-password/${rawToken}`;

    // Send the reset email
    const emailResult = await sendPasswordResetEmail(
      user.email,
      `${retrieval.firstName} ${retrieval.lastName}`,
      resetUrl
    );

    if (!emailResult.success) {
      console.error('⚠️ Retrieval approved but email failed to send:', emailResult.error);
    }

    // Sync admin navbar badges
    emitBadgeCounts(req.io);

    console.log(`✅ Account retrieval approved: ${retrieval.firstName} ${retrieval.lastName} (${retrieval.email})`);

    res.json({
      message: 'Password reset approved and email sent',
      emailSent: emailResult.success
    });
  } catch (error) {
    console.error('Error approving account retrieval:', error);
    res.status(500).json({ error: 'Failed to approve account retrieval request' });
  }
};

// POST /api/admin/account-retrievals/:requestId/reject
const rejectRetrieval = async (req, res) => {
  try {
    const { requestId } = req.params;

    const retrieval = await AccountRetrieval.findById(requestId);
    if (!retrieval) {
      return res.status(404).json({ error: 'Account retrieval request not found' });
    }

    if (retrieval.status !== 'Pending') {
      return res.status(400).json({ error: 'This request has already been processed' });
    }

    // Remove the request from the database after rejection
    await AccountRetrieval.findByIdAndDelete(requestId);

    // Sync admin navbar badges
    emitBadgeCounts(req.io);

    console.log(`❌ Account retrieval rejected: ${retrieval.firstName} ${retrieval.lastName} (${retrieval.email})`);

    res.json({ message: 'Account retrieval request rejected successfully' });
  } catch (error) {
    console.error('Error rejecting account retrieval:', error);
    res.status(500).json({ error: 'Failed to reject account retrieval request' });
  }
};

module.exports = { 
  dashboard, 
  users_get, 
  reports, 
  accountRequests, 
  emailSettings,
  badgeCounts,
  dashboardStats,
  recentActivity,
  usersApi,
  updateRole,
  deleteUser,
  recentApproved,
  accountRequestsApi,
  approveRequest,
  rejectRequest,
  getEmailSettings,
  saveEmailSettings,
  testEmail,
  recentApprovedTheses,
  recentTheses,
  recentReviews,
  systemHealth,
  thesisRequestsApi: async (req, res) => {
    try {
      const requests = await ThesisRequest.find()
        .populate('thesis', 'title')
        .populate('requester', 'name email')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      res.json(requests);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch file requests' });
    }
  },
  accountRetrievalsApi,
  approveRetrieval,
  rejectRetrieval
};
