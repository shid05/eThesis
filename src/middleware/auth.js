const User = require('../models/User');

async function ensureAuthenticated(req, res, next) {
  if (!req.session || !req.session.user) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/login');
  }

  // Verify the user still exists in the database.
  // Deleted accounts retain a valid session cookie until expiry, so we must
  // confirm the record is present on every authenticated request.
  const exists = await User.exists({ _id: req.session.user.id });
  if (!exists) {
    req.session.destroy(() => {});
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Account no longer exists' });
    }
    return res.redirect('/login');
  }

  return next();
}

function ensureRole(...roles) {
  return (req, res, next) => {
    // First check if user is authenticated
    if (!req.session || !req.session.user) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      return res.redirect('/login');
    }
    
    // Admin override: admins can access everything
    if (req.session.user.role === 'Admin') {
      return next();
    }

    // Then check if user has required role
    if (roles.includes(req.session.user.role)) {
      return next();
    }
    
    // For API requests, return JSON error
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    // For regular requests, show forbidden page
    return res.status(403).send(`
      <html>
        <head><title>Forbidden</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1>403 - Forbidden</h1>
          <p>You don't have permission to access this resource.</p>
          <p>Required role(s): ${roles.join(', ')}</p>
          <p>Your role: ${req.session.user.role}</p>
          <a href="/">Go Home</a>
        </body>
      </html>
    `);
  };
}

module.exports = { ensureAuthenticated, ensureRole };


