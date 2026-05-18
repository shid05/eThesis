const mongoose = require('mongoose');
const ThesisRequest = require('../models/ThesisRequest');
const Thesis = require('../models/Thesis');
const User = require('../models/User');
const { cloudinary, extractPublicIdFromUrl } = require('../utils/cloudinary');
const { sendFileRequestNotification, sendFileFulfillmentEmail } = require('../utils/emailService');
const { createNotification } = require('../utils/notificationHelper');

// POST /api/thesis-requests
const submitRequest = async (req, res) => {
  try {
    const { thesisId, reason } = req.body;

    if (!thesisId || !mongoose.Types.ObjectId.isValid(thesisId)) {
      return res.status(400).json({ error: 'Invalid thesis ID' });
    }
    if (!reason || reason.trim().length < 20) {
      return res.status(400).json({ error: 'Please provide at least 20 characters for your reason' });
    }

    const thesis = await Thesis.findById(thesisId).populate('author', 'name email');
    if (!thesis) return res.status(404).json({ error: 'Thesis not found' });
    if (thesis.status !== 'Approved') {
      return res.status(400).json({ error: 'File requests are only available for approved theses' });
    }

    const requesterId = req.session.user.id;
    if (thesis.author._id.toString() === requesterId) {
      return res.status(400).json({ error: 'You cannot request your own thesis file' });
    }

    // Check for an existing pending request
    const existing = await ThesisRequest.findOne({
      thesis: thesisId,
      requester: requesterId,
      status: { $in: ['pending', 'approved'] }
    });
    if (existing) {
      return res.status(409).json({
        error: existing.status === 'pending'
          ? 'You already have a pending request for this thesis. Please wait for approval.'
          : 'Your previous request for this thesis has already been approved. Check your email.'
      });
    }

    // Create the request with a unique approval token (7-day expiry)
    const token = ThesisRequest.generateToken();
    const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const request = await ThesisRequest.create({
      thesis: thesisId,
      requester: requesterId,
      reason: reason.trim(),
      approvalToken: token,
      tokenExpiresAt
    });

    // Build approval URL
    const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    const approvalUrl = `${appUrl}/thesis-requests/approve/${token}`;

    // Collect recipient emails: thesis author + all admins
    const admins = await User.find({ role: 'Admin' }).select('email').lean();
    const adminEmails = admins.map(a => a.email).filter(Boolean);
    const recipients = [...new Set([thesis.author.email, ...adminEmails].filter(Boolean))];

    const requesterUser = await User.findById(requesterId).select('name email').lean();

    // Fire-and-forget the emails (don't block the response)
    sendFileRequestNotification(
      recipients,
      { name: requesterUser.name, email: requesterUser.email },
      { title: thesis.title, authorsName: thesis.authorsName, yearPublished: thesis.yearPublished },
      reason.trim(),
      approvalUrl
    ).catch(err => console.error('Failed to send file request notification:', err.message));

    // Notify the author in-app
    await createNotification(req.io, thesis.author._id, {
      type: 'info',
      title: 'New File Request',
      message: `${requesterUser.name} has requested the file for "${thesis.title}". Check your email to approve.`,
      link: `/thesis/${thesisId}`
    });

    console.log(`📬 File request submitted: "${thesis.title}" by ${requesterUser.name}`);
    res.json({ success: true, message: 'Your request has been submitted. The author and administrators have been notified and will review your request.' });
  } catch (error) {
    console.error('Error submitting file request:', error);
    res.status(500).json({ error: 'Failed to submit request' });
  }
};

// GET /thesis-requests/approve/:token
const approveRequest = async (req, res) => {
  try {
    const { token } = req.params;

    const request = await ThesisRequest.findOne({ approvalToken: token })
      .populate('thesis')
      .populate('requester', 'name email');

    if (!request) {
      return res.status(404).send(`
        <html><body style="font-family:Arial,sans-serif;text-align:center;padding:60px">
          <h2 style="color:#dc3545">❌ Invalid or Expired Link</h2>
          <p>This approval link is invalid or has already been used.</p>
          <a href="${process.env.APP_URL || '/'}">← Return to Home</a>
        </body></html>
      `);
    }

    if (request.tokenExpiresAt && request.tokenExpiresAt < new Date()) {
      return res.status(410).send(`
        <html><body style="font-family:Arial,sans-serif;text-align:center;padding:60px">
          <h2 style="color:#ffc107">⏰ Link Expired</h2>
          <p>This approval link expired on ${request.tokenExpiresAt.toLocaleDateString()}.</p>
          <p>The requester will need to submit a new request.</p>
          <a href="${process.env.APP_URL || '/'}">← Return to Home</a>
        </body></html>
      `);
    }

    if (request.status === 'fulfilled') {
      return res.send(`
        <html><body style="font-family:Arial,sans-serif;text-align:center;padding:60px">
          <h2 style="color:#28a745">✅ Already Approved</h2>
          <p>This request was already approved on ${request.approvedAt?.toLocaleDateString()}.</p>
          <p>The file was sent to <strong>${request.requester.email}</strong>.</p>
          <a href="${process.env.APP_URL || '/'}">← Return to Home</a>
        </body></html>
      `);
    }

    if (request.status !== 'pending') {
      return res.send(`
        <html><body style="font-family:Arial,sans-serif;text-align:center;padding:60px">
          <h2>Request Status: ${request.status}</h2>
          <p>This request has already been processed.</p>
          <a href="${process.env.APP_URL || '/'}">← Return to Home</a>
        </body></html>
      `);
    }

    const thesis = request.thesis;
    if (!thesis || !thesis.fileUrl) {
      return res.status(500).send(`
        <html><body style="font-family:Arial,sans-serif;text-align:center;padding:60px">
          <h2 style="color:#dc3545">❌ File Not Found</h2>
          <p>The thesis file could not be located. Please contact the administrator.</p>
          <a href="${process.env.APP_URL || '/'}">← Return to Home</a>
        </body></html>
      `);
    }

    // Generate a 48-hour signed Cloudinary URL
    const publicId = extractPublicIdFromUrl(thesis.fileUrl);
    const expiresAt = Math.floor(Date.now() / 1000) + 48 * 3600;
    const signedUrl = cloudinary.url(publicId, {
      resource_type: 'raw',
      type: 'upload',
      sign_url: true,
      expires_at: expiresAt
    });

    // Send fulfillment email to the requester
    await sendFileFulfillmentEmail(
      request.requester.email,
      request.requester.name,
      { title: thesis.title, authorsName: thesis.authorsName, yearPublished: thesis.yearPublished },
      signedUrl,
      48
    );

    // Mark as fulfilled
    request.status = 'fulfilled';
    request.approvedAt = new Date();
    request.fulfilledAt = new Date();
    request.approvalToken = undefined; // invalidate token
    await request.save();

    // Notify the requester in-app if socket is available
    if (req.io) {
      const { createNotification } = require('../utils/notificationHelper');
      await createNotification(req.io, request.requester._id, {
        type: 'success',
        title: 'File Request Approved!',
        message: `Your request for "${thesis.title}" was approved. Check your email for the download link.`,
        link: `/thesis/${thesis._id}`
      });
    }

    console.log(`✅ File request approved: "${thesis.title}" → ${request.requester.email}`);

    res.send(`
      <html><head><style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 60px; background: #f9f9f9; }
        .card { background: white; max-width: 500px; margin: 0 auto; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        h2 { color: #28a745; } a { color: #667eea; }
      </style></head><body>
        <div class="card">
          <h2>✅ Request Approved!</h2>
          <p>The thesis file for <strong>"${thesis.title}"</strong> has been sent to:</p>
          <p><strong>${request.requester.email}</strong></p>
          <p style="color:#666;font-size:14px">The download link in the email will expire in 48 hours.</p>
          <br><a href="${process.env.APP_URL || '/'}">← Return to LNC Research Archives</a>
        </div>
      </body></html>
    `);
  } catch (error) {
    console.error('Error approving file request:', error);
    res.status(500).send(`
      <html><body style="font-family:Arial,sans-serif;text-align:center;padding:60px">
        <h2 style="color:#dc3545">❌ Server Error</h2>
        <p>Something went wrong processing this approval. Please try again or contact the administrator.</p>
        <a href="${process.env.APP_URL || '/'}">← Return to Home</a>
      </body></html>
    `);
  }
};

// GET /api/admin/thesis-requests — admin list view
const listRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const requests = await ThesisRequest.find(filter)
      .populate('thesis', 'title authorsName yearPublished')
      .populate('requester', 'name email')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json(requests);
  } catch (error) {
    console.error('Error fetching thesis requests:', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
};

module.exports = { submitRequest, approveRequest, listRequests };
