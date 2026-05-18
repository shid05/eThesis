const Thesis = require('../models/Thesis');
const User = require('../models/User');
const multer = require('multer');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinary');
const { createNotification } = require('../utils/notificationHelper');

// Multer memory storage for profile pictures (buffer sent to Cloudinary)
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter
});

// GET /
const index = async (req, res) => {
  try {
    const [totalTheses, totalReviews, totalUsers] = await Promise.all([
      Thesis.countDocuments({ status: 'Approved' }),
      Review.countDocuments(),
      User.countDocuments()
    ]);
    res.render('index', { totalTheses, totalReviews, totalUsers });
  } catch (error) {
    console.error('Error fetching stats for index:', error);
    res.render('index', { totalTheses: 0, totalReviews: 0, totalUsers: 0 });
  }
};

// GET /about
const about = (req, res) => {
  res.render('about');
};

// GET /help
const help = (req, res) => {
  res.render('help');
};

// GET /contact
const contact = (req, res) => {
  res.render('contact');
};

// GET /profile
const profile = (req, res) => {
  res.render('profile');
};

// GET /session-info
const sessionInfo = async (req, res) => {
  try {
    let userData = req.session.user || null;

    if (userData) {
      // Refresh profile picture from DB
      const user = await User.findById(userData.id).select('profilePicture');
      if (user && user.profilePicture) {
        userData = { ...userData, profilePicture: user.profilePicture };
      }
    }

    res.json({ 
      user: userData,
      isAuthenticated: !!(req.session && req.session.user),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in /session-info:', error);
    res.json({ 
      user: req.session.user || null,
      isAuthenticated: !!(req.session && req.session.user),
      timestamp: new Date().toISOString()
    });
  }
};

// POST /api/profile/update-name
const updateName = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const userId = req.session.user.id;
    await User.findByIdAndUpdate(userId, { name: name.trim() });
    
    // Auto-update session context
    req.session.user.name = name.trim();
    
    res.json({ success: true, name: name.trim() });
  } catch (err) {
    console.error('Error updating profile name:', err);
    res.status(500).json({ error: 'Failed to update name' });
  }
};

// POST /api/profile/upload-picture
const uploadPicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.session.user.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete old picture from Cloudinary if it has a cloudinary public_id
    if (user.profilePicturePublicId) {
      try { await deleteFromCloudinary(user.profilePicturePublicId); } catch (e) {
        console.warn('Could not delete old profile picture from Cloudinary:', e.message);
      }
    }

    // Upload new picture to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer, {
      folder: 'ethesis/profiles',
      resource_type: 'image',
      public_id: `profile-${userId}-${Date.now()}`,
      transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }]
    });

    user.profilePicture = result.secure_url;
    user.profilePicturePublicId = result.public_id;
    await user.save();

    req.session.user.profilePicture = result.secure_url;

    res.json({ message: 'Profile picture uploaded successfully', profilePicture: result.secure_url });
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    res.status(500).json({ error: 'Failed to upload profile picture' });
  }
};

// POST /api/profile/update-email
const updateEmail = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || email.trim() === '') {
      return res.status(400).json({ error: 'Email is required' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    const normalized = email.trim().toLowerCase();
    const userId = req.session.user.id;
    const existing = await User.findOne({ email: normalized, _id: { $ne: userId } });
    if (existing) {
      return res.status(409).json({ error: 'That email address is already in use by another account' });
    }
    await User.findByIdAndUpdate(userId, { email: normalized });
    req.session.user.email = normalized;
    res.json({ success: true, email: normalized });
  } catch (err) {
    console.error('Error updating email:', err);
    res.status(500).json({ error: 'Failed to update email' });
  }
};

// GET /api/stats
const getStats = async (req, res) => {
  try {
    const [totalTheses, totalUsers] = await Promise.all([
      Thesis.countDocuments({ status: 'Approved' }),
      User.countDocuments()
    ]);

    res.json({
      totalTheses,
      totalUsers,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
};

// GET /api/active-users
const getActiveUsers = async (req, res) => {
  try {
    // Use the real-time activeUsers Map from Socket.IO tracking
    // instead of querying the database (which would show all users as online)
    const activeUsersMap = req.activeUsers || new Map();
    const users = Array.from(activeUsersMap.values()).map(user => ({
      name: user.name,
      role: user.role,
      lastSeen: user.lastSeen,
      profilePicture: user.profilePicture || null
    }));

    res.json({
      count: users.length,
      users,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching active users:', error);
    res.status(500).json({ error: 'Failed to fetch active users' });
  }
};

// POST /api/profile/change-password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New passwords do not match' });
    }

    const user = await User.findById(req.session.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isMatch = await user.compareOrMigratePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Set and save new password (pre-save hook will hash it)
    user.password = newPassword;
    user.markModified('password');
    await user.save();

    // Create persistent notification for password change
    await createNotification(req.io, user._id, {
      type: 'warning',
      title: 'Security Alert: Password Changed',
      message: 'Your password was recently changed. If this was not you, please contact an administrator immediately.',
      link: '/profile'
    });

    console.log(`🔑 Password changed for user: ${user.name} (${user.email})`);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('Error changing password:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
};

// GET /api/test
const testEndpoint = (req, res) => {
  res.json({ 
    message: 'Routes are working!',
    timestamp: new Date().toISOString(),
    user: req.session.user || null
  });
};

module.exports = { 
  index, 
  about,
  help,
  contact,
  profile, 
  sessionInfo, 
  updateName,
  updateEmail,
  uploadPicture,
  upload,
  changePassword,
  getStats, 
  getActiveUsers, 
  testEndpoint 
};
