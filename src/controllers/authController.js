const User = require('../models/User');
const AccountRequest = require('../models/AccountRequest');
const AccountRetrieval = require('../models/AccountRetrieval');
const { emitBadgeCounts } = require('../utils/badgeCounts');
const { createNotificationForMany } = require('../utils/notificationHelper');

// GET /login
const login_get = (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }
  res.render('login');
};

// POST /login
const login_post = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validation
    if (!email || !password) {
      return res.status(400).send('All fields are required');
    }
    
    const normalizedEmail = String(email).trim().toLowerCase();
    
    // Find user
    const user = await User.findOne({ email: normalizedEmail });
    
    if (!user) {
      return res.status(400).send('No account found with that email address');
    }
    
    // Verify password
    const isValidPassword = await (user.compareOrMigratePassword 
      ? user.compareOrMigratePassword(password) 
      : user.comparePassword(password));
      
    if (!isValidPassword) {
      return res.status(400).send('Incorrect password. Please try again');
    }
    
    // Set session
    req.session.user = { 
      id: user._id, 
      name: user.name, 
      email: user.email, 
      role: user.role,
      profilePicture: user.profilePicture || null
    };
    
    // Save session explicitly before redirecting to avoid race condition
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.status(500).send('Server error during login');
      }
      res.redirect('/');
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).send('Server error during login');
  }
};

// GET /request-account
const requestAccount_get = (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }
  res.render('request-account');
};

// POST /request-account
const requestAccount_post = async (req, res) => {
  try {
    const { name, email, role } = req.body;
    
    // Validation - check for empty strings too
    if (!name || !name.trim() || !email || !email.trim() || !role || !role.trim()) {
      return res.status(400).send('All fields are required');
    }
    
    const normalizedEmail = String(email).trim().toLowerCase();
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).send('Email already has an account. Please login instead.');
    }
    
    // Check if there's already a pending request for this email
    const existingRequest = await AccountRequest.findOne({ 
      email: normalizedEmail, 
      status: 'Pending' 
    });
    if (existingRequest) {
      return res.status(400).send('You already have a pending account request. Please wait for admin approval.');
    }
    
    // Create account request
    const accountRequest = await AccountRequest.create({ 
      name: name.trim(), 
      email: normalizedEmail, 
      role: role || 'Student',
      status: 'Pending'
    });
    
    // Notify all admin users — persistent DB notification + real-time push
    const admins = await User.find({ role: 'Admin' });
    const adminIds = admins.map(a => a._id);

    await createNotificationForMany(req.io, adminIds, {
      type: 'info',
      title: 'New Account Request',
      message: `${name} (${normalizedEmail}) has requested a ${role} account.`,
      link: '/admin/account-requests'
    });

    // Sync admin navbar badges (pendingRequests++)
    emitBadgeCounts(req.io);
    
    // Also send email notification to admins (optional)
    try {
      const { sendAdminNotificationEmail } = require('../utils/emailService');
      for (const admin of admins) {
        await sendAdminNotificationEmail(admin.email, name, normalizedEmail, role);
      }
    } catch (emailError) {
      console.log('⚠️ Email notification to admin failed (this is optional):', emailError.message);
    }
    
    console.log(`✅ Account request submitted: ${name} (${normalizedEmail}) - ${role}`);
    
    // Redirect with success message
    res.redirect('/request-account?success=1');
  } catch (err) {
    console.error('❌ Account request error:', err);
    
    // Handle validation errors
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).send(messages.join('. '));
    }
    
    res.status(500).send('Server error during account request submission');
  }
};

// GET /forgot-password
const forgotPassword_get = (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }
  res.render('forgot-password');
};

// POST /forgot-password
const forgotPassword_post = async (req, res) => {
  try {
    const { email } = req.body;

    // Basic validation
    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Check if a user with this email exists
    const user = await User.findOne({ email: normalizedEmail });

    if (user) {
      // Split user.name to approximate firstName and lastName for AccountRetrieval
      const nameParts = (user.name || 'Unknown User').split(' ');
      const trimmedFirst = nameParts[0];
      const trimmedLast = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'User';
      const fullName = user.name || 'Unknown User';
      // Check for existing pending retrieval request
      const existingRetrieval = await AccountRetrieval.findOne({
        email: normalizedEmail,
        status: 'Pending'
      });

      if (!existingRetrieval) {
        // Create a new account retrieval request
        await AccountRetrieval.create({
          firstName: trimmedFirst,
          lastName: trimmedLast,
          email: normalizedEmail,
          userId: user._id,
          status: 'Pending'
        });

        // Notify admins — persistent DB notification + real-time push
        const admins = await User.find({ role: 'Admin' });
        const adminIds = admins.map(a => a._id);

        await createNotificationForMany(req.io, adminIds, {
          type: 'warning',
          title: 'Account Retrieval Request',
          message: `${fullName} (${normalizedEmail}) has requested a password reset.`,
          link: '/admin/account-requests'
        });

        // Sync admin navbar badges
        emitBadgeCounts(req.io);

        console.log(`🔑 Account retrieval request submitted: ${fullName} (${normalizedEmail})`);
      } else {
        console.log(`🔑 Duplicate retrieval request ignored: ${fullName} (${normalizedEmail})`);
      }
    } else {
      // User not found — silently succeed (prevent user enumeration)
      console.log(`🔑 Forgot password attempt for non-existent user email: ${normalizedEmail}`);
    }

    // Always return success to prevent user enumeration
    return res.json({ message: 'If your account exists, your request has been sent for review.' });
  } catch (err) {
    console.error('❌ Forgot password error:', err);
    return res.json({ message: 'If your account exists, your request has been sent for review.' });
  }
};

// GET /reset-password/:token
const resetPassword_get = async (req, res) => {
  try {
    const { token } = req.params;
    const retrieval = await AccountRetrieval.findByToken(token);

    if (!retrieval) {
      return res.render('reset-password', { tokenError: true, token: '' });
    }

    res.render('reset-password', { tokenError: false, token });
  } catch (err) {
    console.error('❌ Reset password page error:', err);
    res.render('reset-password', { tokenError: true, token: '' });
  }
};

// POST /reset-password
const resetPassword_post = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.trim().length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Find the retrieval request by token
    const retrieval = await AccountRetrieval.findByToken(token);
    if (!retrieval) {
      return res.status(400).json({ error: 'Invalid or expired reset token. Please submit a new request.' });
    }

    // Find the user
    const user = await User.findById(retrieval.userId);
    if (!user) {
      return res.status(400).json({ error: 'User account not found.' });
    }

    // Update the user's password
    user.password = newPassword.trim();
    await user.save();

    // Mark the retrieval as used (clear the token)
    retrieval.resetToken = null;
    retrieval.resetTokenExpires = null;
    retrieval.status = 'Approved'; // Keep approved status
    await retrieval.save();

    console.log(`✅ Password reset successfully for: ${user.name} (${user.email})`);

    return res.json({ message: 'Password has been reset successfully.' });
  } catch (err) {
    console.error('❌ Reset password error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
};

// GET /logout
const logout_get = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
      return res.status(500).send('Error logging out');
    }
    res.redirect('/login');
  });
};

module.exports = { 
  login_get, 
  login_post, 
  requestAccount_get, 
  requestAccount_post, 
  forgotPassword_get,
  forgotPassword_post,
  resetPassword_get,
  resetPassword_post,
  logout_get 
};
