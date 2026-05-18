const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const { getBadgeCounts } = require('./src/utils/badgeCounts');

const app = express();

// Trust proxy for secure cookies over ngrok/HTTPS
app.set('trust proxy', 1);

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? (process.env.APP_URL || false)
      : '*',
    methods: ["GET", "POST"]
  }
});

// Environment
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI
const SESSION_SECRET = process.env.SESSION_SECRET || 'secret';
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  console.error('❌ FATAL: SESSION_SECRET environment variable is not set in production. Exiting.');
  process.exit(1);
}

// MongoDB connection with better error handling
mongoose
  .connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    console.log('🔄 Server will continue running but database features will be limited');
    // Don't exit process, allow server to run without MongoDB for development
  });

// Handle MongoDB connection events
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

// ── Security headers (helmet) ──────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:    ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:     ["'self'", "data:", "https://fonts.gstatic.com"],
      imgSrc:      ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://*.cloudinary.com"],
      connectSrc:  ["'self'", "ws:", "wss:"],
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
      baseUri:     ["'self'"],
    }
  },
  crossOriginEmbedderPolicy: false,
}));

// Force HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.hostname}${req.url}`);
    }
    next();
  });
}

// ── Rate limiters ────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// ── Request parsing ──────────────────────────────────────────────────────────
// Middleware
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(mongoSanitize());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      httpOnly: true, // Prevent XSS attacks
      sameSite: 'lax' // CSRF protection
    },
    store: MongoStore.create({ 
      mongoUrl: MONGO_URI,
      touchAfter: 24 * 3600, // lazy session update
      ttl: 14 * 24 * 60 * 60 // 14 days
    }).on('error', (err) => {
      console.error('Session store error:', err);
      // Continue with memory store if MongoDB fails
    })
  })
);

// Static files — CSS/JS use cache-busting query strings (?v=timestamp) in EJS,
// so a 1-day browser cache is safe and avoids redundant downloads.
app.use('/public', express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',        // cache CSS/JS for 1 day
  etag: true           // enable ETag for conditional requests
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: 0 }));

// Expose user to templates and socket.io
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  req.io = io; // Make io accessible in routes
  req.activeUsers = activeUsers; // Make active users map accessible in routes
  next();
});

// Real-time active users tracking (keyed by userId, not socketId)
const activeUsers = new Map();        // userId -> user data
const socketToUser = new Map();       // socketId -> userId
const disconnectTimers = new Map();   // userId -> timeout handle

function broadcastActiveUsers() {
  io.emit('active-users-update', {
    count: activeUsers.size,
    users: Array.from(activeUsers.values()).map(user => ({
      name: user.name,
      role: user.role,
      lastSeen: user.lastSeen,
      profilePicture: user.profilePicture || null
    }))
  });
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔌 User connected:', socket.id);
  
  // Immediately send the current active users to the new connection
  socket.emit('active-users-update', {
    count: activeUsers.size,
    users: Array.from(activeUsers.values()).map(user => ({
      name: user.name,
      role: user.role,
      lastSeen: user.lastSeen,
      profilePicture: user.profilePicture || null
    }))
  });
  
  socket.on('join-room', (roomId) => {
    if (roomId) socket.join(roomId);
  });

  socket.on('user-login', (userData) => {
    if (!userData || !userData.id) return;
    
    // Cancel any pending disconnect timer for this user (they just navigated pages)
    if (disconnectTimers.has(userData.id)) {
      clearTimeout(disconnectTimers.get(userData.id));
      disconnectTimers.delete(userData.id);
    }
    
    // Join the user's personal room so io.to(userId) works for targeted events
    socket.join(userData.id);

    // Track socket -> user mapping
    socketToUser.set(socket.id, userData.id);
    
    // Store/update user in activeUsers keyed by userId
    activeUsers.set(userData.id, {
      ...userData,
      lastSeen: new Date()
    });
    
    // Admins also join a shared "admins" room so we can broadcast
    // badge-counts-update events to every admin in one emit.
    if (userData.role === 'Admin') {
      socket.join('admins');
      // Send the current counts immediately so this admin's navbar
      // is in sync without having to wait for the HTTP fetch to land.
      getBadgeCounts()
        .then((counts) => socket.emit('badge-counts-update', counts))
        .catch((err) => console.error('Initial badge-counts emit failed:', err.message));
    }

    broadcastActiveUsers();
    console.log(`👤 User online: ${userData.name} (${userData.role})`);
  });
  
  socket.on('disconnect', () => {
    const userId = socketToUser.get(socket.id);
    socketToUser.delete(socket.id);
    
    if (userId && activeUsers.has(userId)) {
      // Check if this user still has other active sockets
      const hasOtherSockets = Array.from(socketToUser.values()).includes(userId);
      
      if (!hasOtherSockets) {
        // Grace period: wait 5 seconds before removing (allows page navigation)
        const timer = setTimeout(() => {
          // Re-check: user might have reconnected during the grace period
          const stillConnected = Array.from(socketToUser.values()).includes(userId);
          if (!stillConnected) {
            const userData = activeUsers.get(userId);
            if (userData) {
              console.log(`👋 User went offline: ${userData.name}`);
            }
            activeUsers.delete(userId);
            disconnectTimers.delete(userId);
            broadcastActiveUsers();
          }
        }, 5000);
        
        disconnectTimers.set(userId, timer);
      }
    }
  });
  
});

// Routes
const pageRoutes = require('./src/routes/pageRoutes');
const authRoutes = require('./src/routes/authRoutes');
const thesisRoutes = require('./src/routes/thesisRoutes');
const thesisRequestRoutes = require('./src/routes/thesisRequestRoutes');
const adminRoutes = require('./src/routes/adminRoutes');

app.use('/', pageRoutes);
app.use('/', authRoutes);
app.use('/thesis', thesisRoutes);
app.use('/', thesisRequestRoutes);
app.use('/admin', adminRoutes);

// API endpoint for session info should be handled by pageRoutes
// API endpoint for dashboard stats should be handled by pageRoutes
// API endpoint for active users should be handled by pageRoutes

// 404
app.use((req, res) => {
  res.status(404).render('404');
});

// Global error handler — never expose stack traces in production
app.use((err, req, res, next) => {
  const isDev = process.env.NODE_ENV !== 'production';
  console.error('Unhandled error:', err);
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(500).json({
      error: 'Internal server error',
      ...(isDev && { details: err.message })
    });
  }
  res.status(500).render('500', { message: isDev ? err.message : null });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Real-time features enabled with Socket.IO`);
});


