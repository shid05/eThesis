const multer = require('multer');
const mongoose = require('mongoose');
const Thesis = require('../models/Thesis');
const ThesisRequest = require('../models/ThesisRequest');
const User = require('../models/User');
const {
  cloudinary,
  uploadToCloudinary,
  getResourceDetails,
  deleteFromCloudinary,
  extractPublicIdFromUrl
} = require('../utils/cloudinary');
const { emitBadgeCounts } = require('../utils/badgeCounts');
const { createNotification, createNotificationForMany } = require('../utils/notificationHelper');

// Multer memory storage (file held in buffer, then sent to Cloudinary)
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: fileFilter
});

// GET /thesis/upload
const upload_get = (req, res) => {
  res.render('upload');
};

// POST /thesis/upload
const upload_post = async (req, res) => {
  try {
    const { title, abstract, category, course, adviser, authorsName, yearPublished } = req.body;
    if (!req.file) {
      return res.status(400).send('Please upload a PDF file');
    }

    // Upload PDF to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer, {
      folder: 'ethesis/theses',
      resource_type: 'raw',
      public_id: `thesis-${req.session.user.id}-${Date.now()}`
    });
    const fileUrl = result.secure_url;
    
    // Verify the resource was uploaded correctly as raw
    const resourceDetails = await getResourceDetails(result.public_id, { resource_type: 'raw' });
    console.log('🔍 Cloudinary resource details:', {
      resource_type: resourceDetails.resource_type,
      format: resourceDetails.format,
      secure_url: resourceDetails.secure_url
    });
    
    // Validation
    if (!title || !abstract || !category || !course || !adviser || !authorsName || !yearPublished) {
      return res.status(400).send('All fields are required');
    }
    
    if (title.trim().length < 10) {
      return res.status(400).send('Title must be at least 10 characters long');
    }
    
    if (abstract.trim().length < 100) {
      return res.status(400).send('Abstract must be at least 100 characters long');
    }
    
    // Create thesis
    const thesis = await Thesis.create({ 
      title: title.trim(), 
      abstract: abstract.trim(), 
      category: category.trim(),
      course: course.trim().toUpperCase(),
      adviser: adviser.trim(),
      authorsName: authorsName.trim(),
      yearPublished: yearPublished.trim(),
      fileUrl: fileUrl, 
      author: req.session.user.id 
    });
    
    console.log(`✅ New thesis created: "${thesis.title}" by ${req.session.user.name}`);

    // Sync admin navbar badges (pendingTheses++)
    emitBadgeCounts(req.io);

    // Notify all Admins and Teachers about the new pending thesis
    const staffUsers = await User.find({ role: { $in: ['Admin', 'Teacher'] } }).select('_id role').lean();
    const adminIds   = staffUsers.filter(u => u.role === 'Admin').map(u => u._id);
    const teacherIds = staffUsers.filter(u => u.role === 'Teacher').map(u => u._id);
    const notifBase  = {
      type:    'warning',
      title:   'New Thesis Pending',
      message: `New Thesis Pending: "${thesis.title}" requires your review.`
    };
    if (adminIds.length > 0)   await createNotificationForMany(req.io, adminIds,   { ...notifBase, link: '/thesis/admin/pending' });
    if (teacherIds.length > 0) await createNotificationForMany(req.io, teacherIds, { ...notifBase, link: '/thesis/reviewer/pending' });

    res.redirect('/thesis/mine');
  } catch (err) {
    console.error('Thesis creation error:', err);
    
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).send(messages.join('. '));
    }
    
    if (err.code === 11000) {
      return res.status(400).send('A thesis with this title already exists');
    }
    
    res.status(500).send('Server error during thesis upload: ' + err.message);
  }
};

// GET /thesis/mine (page)
const myTheses = (req, res) => {
  res.render('my_theses');
};

// GET /thesis/api/mine (JSON)
const myThesesApi = async (req, res) => {
  try {
    const list = await Thesis.find({ author: req.session.user.id }).sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    console.error('Error fetching user theses:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /thesis (page - all approved)
const allApproved = (req, res) => {
  res.render('theses');
};

// GET /thesis/api (JSON - list approved)
const allApprovedApi = async (req, res) => {
  try {
    const theses = await Thesis.find({ status: 'Approved' })
      .populate('author', 'name')
      .sort({ createdAt: -1 });
    res.json(theses);
  } catch (err) {
    console.error('Error fetching approved theses:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /thesis/:id (page - detail)
const detail = (req, res, next) => {
  const firstSeg = (req.params.id || '').toLowerCase();
  const reserved = new Set(['api', 'upload', 'mine', 'reviewer', 'admin', 'edit', 'delete']);
  if (reserved.has(firstSeg)) return next();
  return res.render('thesis_detail', { thesis: null });
};

// GET /thesis/api/:id (JSON - detail with reviews)
const detailApi = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Thesis not found' });
    }
    const thesis = await Thesis.findById(req.params.id).populate('author', 'name');
    if (!thesis) {
      return res.status(404).json({ error: 'Thesis not found' });
    }
    
    // Visibility rules
    const isPubliclyViewable = thesis.status === 'Approved';
    const isOwner = req.session?.user?.id === thesis.author._id.toString();
    const isTeacher = req.session?.user?.role === 'Teacher';
    const isAdmin = req.session?.user?.role === 'Admin';

    const canViewPending = thesis.status === 'Pending' && (isOwner || isTeacher || isAdmin);
    const canViewRejected = thesis.status === 'Rejected' && (isOwner || isTeacher || isAdmin);

    if (!isPubliclyViewable && !canViewPending && !canViewRejected) {
      return res.status(403).json({ error: 'You do not have access to view this thesis' });
    }
    
    // Check if user has a pending/fulfilled file request for this thesis
    let existingRequest = null;
    if (req.session?.user && !isOwner && thesis.status === 'Approved') {
      existingRequest = await ThesisRequest.findOne({
        thesis: thesis._id,
        requester: req.session.user.id,
        status: { $in: ['pending', 'fulfilled'] }
      }).select('status createdAt').lean();
    }

    res.json({
      thesis,
      userRole: req.session?.user?.role || null,
      isAuthor: isOwner,
      canRequest: req.session?.user && !isOwner && thesis.status === 'Approved',
      existingRequest
    });
  } catch (e) {
    console.error('Error fetching thesis details:', e);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /thesis/reviewer/pending (page)
const reviewerPending = (req, res) => {
  res.render('reviewer_pending');
};

// GET /thesis/api/reviewer/pending (JSON)
const reviewerPendingApi = async (req, res) => {
  try {
    const list = await Thesis.find({ status: 'Pending' })
      .populate('author', 'name email')
      .sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    console.error('Error fetching pending theses for reviewers:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /thesis/admin/pending (page)
const adminPending = (req, res) => {
  res.render('admin_pending');
};

// GET /thesis/api/admin/pending (JSON)
const adminPendingApi = async (req, res) => {
  try {
    const list = await Thesis.find({ status: 'Pending' })
      .populate('author', 'name email')
      .sort({ createdAt: -1 });
    res.json(list);
  } catch (err) {
    console.error('Error fetching pending theses:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /thesis/edit/:id (page)
const edit_get = async (req, res) => {
  try {
    const thesis = await Thesis.findById(req.params.id);
    if (!thesis) {
      return res.status(404).send('Thesis not found');
    }
    if (thesis.author.toString() !== req.session.user.id) {
      return res.status(403).send('You can only edit your own theses');
    }
    if (thesis.status !== 'Pending') {
      return res.status(400).send('Only pending theses can be edited');
    }
    res.render('edit_thesis');
  } catch (err) {
    console.error('Error accessing edit form:', err);
    res.status(500).send('Server error');
  }
};

// POST /thesis/edit/:id
const edit_post = async (req, res) => {
  try {
    const { title, abstract, category, course, adviser, authorsName, yearPublished } = req.body;
    
    if (!title || !abstract || !category || !course || !adviser || !authorsName || !yearPublished) {
      return res.status(400).send('All fields are required');
    }
    
    const thesis = await Thesis.findById(req.params.id);
    if (!thesis) {
      return res.status(404).send('Thesis not found');
    }
    if (thesis.author.toString() !== req.session.user.id) {
      return res.status(403).send('You can only edit your own theses');
    }
    if (thesis.status !== 'Pending') {
      return res.status(400).send('Only pending theses can be edited');
    }
    
    const updateData = {
      title: title.trim(),
      abstract: abstract.trim(),
      category: category.trim(),
      course: course.trim().toUpperCase(),
      adviser: adviser.trim(),
      authorsName: authorsName.trim(),
      yearPublished: yearPublished.trim()
    };
    
    if (req.file) {
      // Delete old Cloudinary file if it exists
      if (thesis.fileUrl && thesis.fileUrl.includes('cloudinary.com')) {
        const oldPublicId = thesis.fileUrl.split('/').pop().split('.')[0];
        await deleteFromCloudinary(oldPublicId, { resource_type: 'raw' });
      }
      
      // Upload new PDF to Cloudinary
      const result = await uploadToCloudinary(req.file.buffer, {
        folder: 'ethesis/theses',
        resource_type: 'raw',
        public_id: `thesis-${req.session.user.id}-${Date.now()}`
      });
      updateData.fileUrl = result.secure_url;
    }
    
    await Thesis.findByIdAndUpdate(req.params.id, updateData);
    
    console.log(`✅ Thesis updated: "${title}" by ${req.session.user.name}`);
    res.redirect('/thesis/mine');
  } catch (err) {
    console.error('Error updating thesis:', err);
    
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).send(messages.join('. '));
    }
    
    res.status(500).send('Server error during thesis update');
  }
};

// POST /thesis/delete/:id
const delete_post = async (req, res) => {
  try {
    const thesis = await Thesis.findById(req.params.id);
    if (!thesis) {
      return res.status(404).send('Thesis not found');
    }
    if (thesis.author.toString() !== req.session.user.id) {
      return res.status(403).send('You can only delete your own theses');
    }
    if (thesis.status !== 'Pending') {
      return res.status(400).send('Only pending theses can be deleted');
    }
    
    // Delete Cloudinary file if it exists
    if (thesis.fileUrl && thesis.fileUrl.includes('cloudinary.com')) {
      const publicId = thesis.fileUrl.split('/').pop().split('.')[0];
      await deleteFromCloudinary(publicId, { resource_type: 'raw' });
    }
    
    await ThesisRequest.deleteMany({ thesis: thesis._id });
    await Thesis.findByIdAndDelete(req.params.id);
    
    console.log(`🗑️ Thesis deleted: "${thesis.title}" by ${req.session.user.name}`);

    // Sync admin navbar badges (pendingTheses-- if it was pending)
    emitBadgeCounts(req.io);

    res.redirect('/thesis/mine');
  } catch (err) {
    console.error('Error deleting thesis:', err);
    res.status(500).send('Server error during thesis deletion');
  }
};

// POST /thesis/:id/approve
const approve_post = async (req, res) => {
  try {
    const preCheck = await Thesis.findById(req.params.id);
    if (!preCheck) return res.status(404).send('Thesis not found');
    
    const isAdmin = req.session.user.role === 'Admin';
    const isAdviser = req.session.user.role === 'Teacher' && preCheck.adviser && preCheck.adviser.toLowerCase() === req.session.user.name.toLowerCase();
    
    if (!isAdmin && !isAdviser) {
      return res.status(403).send('Unauthorized to approve this thesis');
    }

    const thesis = await Thesis.findByIdAndUpdate(
      req.params.id, 
      { status: 'Approved' },
      { new: true }
    ).populate('author', 'name email');
    
    if (!thesis) return res.status(404).send('Thesis not found');
    
    // Persistent notification to thesis author
    if (thesis.author) {
      await createNotification(req.io, thesis.author._id, {
        type: 'success',
        title: 'Thesis Approved!',
        message: `Your thesis "${thesis.title}" has been approved and is now live.`
      });
    }

    // Notify all students (except the author) that a new thesis is available
    const students = await User.find({
      role: 'Student',
      _id: { $ne: thesis.author?._id }
    }).select('_id').lean();
    const studentIds = students.map(s => s._id);
    if (studentIds.length > 0) {
      await createNotificationForMany(req.io, studentIds, {
        type: 'info',
        title: 'New Approved Thesis!',
        message: `"${thesis.title}" by ${thesis.author?.name} is now available. Check it out!`,
        link: `/thesis/${thesis._id}`
      });
    }

    console.log(`✅ Thesis approved: "${thesis.title}" by ${thesis.author?.name}`);

    // Sync admin navbar badges (pendingTheses--)
    emitBadgeCounts(req.io);

    res.redirect(isAdmin ? '/thesis/admin/pending' : `/thesis/${thesis._id}`);
  } catch (err) {
    console.error('Error approving thesis:', err);
    res.status(500).send('Server error');
  }
};

// POST /thesis/:id/reject
const reject_post = async (req, res) => {
  try {
    const preCheck = await Thesis.findById(req.params.id);
    if (!preCheck) return res.status(404).send('Thesis not found');
    
    const isAdmin = req.session.user.role === 'Admin';
    const isAdviser = req.session.user.role === 'Teacher' && preCheck.adviser && preCheck.adviser.toLowerCase() === req.session.user.name.toLowerCase();
    
    if (!isAdmin && !isAdviser) {
      return res.status(403).send('Unauthorized to reject this thesis');
    }

    const { reason } = req.body;
    
    const thesis = await Thesis.findByIdAndUpdate(
      req.params.id, 
      { status: 'Rejected', rejectionReason: reason || 'No reason provided' },
      { new: true }
    ).populate('author', 'name email');
    
    if (!thesis) return res.status(404).send('Thesis not found');
    
    // Persistent notification to thesis author
    if (thesis.author) {
      await createNotification(req.io, thesis.author._id, {
        type: 'error',
        title: 'Thesis Rejected',
        message: `Your thesis "${thesis.title}" has been rejected. ${reason ? 'Reason: ' + reason : 'Please check with your teacher for details.'}`
      });
    }
    
    console.log(`❌ Thesis rejected: "${thesis.title}" by ${thesis.author?.name}`);

    // Sync admin navbar badges (pendingTheses--)
    emitBadgeCounts(req.io);

    res.redirect(isAdmin ? '/thesis/admin/pending' : `/thesis/${thesis._id}`);
  } catch (err) {
    console.error('Error rejecting thesis:', err);
    res.status(500).send('Server error');
  }
};

// POST /thesis/admin/:id/revoke
const revoke_post = async (req, res) => {
  try {
    const preCheck = await Thesis.findById(req.params.id);
    if (!preCheck) return res.status(404).send('Thesis not found');
    
    const isAdmin = req.session.user.role === 'Admin';
    const isAdviser = req.session.user.role === 'Teacher' && preCheck.adviser && preCheck.adviser.toLowerCase() === req.session.user.name.toLowerCase();
    
    if (!isAdmin && !isAdviser) {
      return res.status(403).send('Unauthorized to revoke this thesis');
    }

    const { reason } = req.body;
    
    const thesis = await Thesis.findByIdAndUpdate(
      req.params.id, 
      { status: 'Pending' },
      { new: true }
    ).populate('author', 'name email');
    
    if (!thesis) {
      return res.status(404).send('Thesis not found');
    }
    
    // Persistent notification to thesis author
    if (thesis.author) {
      await createNotification(req.io, thesis.author._id, {
        type: 'warning',
        title: 'Thesis Approval Revoked',
        message: `Your thesis "${thesis.title}" approval has been revoked and moved back to pending status. ${reason ? 'Reason: ' + reason : 'Please check with your teacher for details.'}`
      });
    }
    
    console.log(`⚠️ Thesis approval revoked: "${thesis.title}" by ${req.session.user.name}`);

    // Sync admin navbar badges (pendingTheses++ — moved back to pending)
    emitBadgeCounts(req.io);

    // Notify all Admins and Teachers that this thesis is pending again
    const revokeStaff    = await User.find({ role: { $in: ['Admin', 'Teacher'] } }).select('_id role').lean();
    const revokeAdmins   = revokeStaff.filter(u => u.role === 'Admin').map(u => u._id);
    const revokeTeachers = revokeStaff.filter(u => u.role === 'Teacher').map(u => u._id);
    const revokeNotif    = {
      type:    'warning',
      title:   'New Thesis Pending',
      message: `New Thesis Pending: "${thesis.title}" requires your review.`
    };
    if (revokeAdmins.length > 0)   await createNotificationForMany(req.io, revokeAdmins,   { ...revokeNotif, link: '/thesis/admin/pending' });
    if (revokeTeachers.length > 0) await createNotificationForMany(req.io, revokeTeachers, { ...revokeNotif, link: '/thesis/reviewer/pending' });

    const referer = req.get('Referer');
    if (referer && referer.includes('/thesis/')) {
      res.redirect(`/thesis/${thesis._id}`);
    } else {
      res.redirect(isAdmin ? '/admin/dashboard' : `/thesis/${thesis._id}`);
    }
  } catch (err) {
    console.error('Error revoking thesis approval:', err);
    res.status(500).send('Server error');
  }
};

// GET /thesis/api/teachers
// Returns the list of users with role "Teacher" (name + id), used to
// populate the Adviser dropdown on the thesis upload / edit pages.
// Only returns teachers with a real, non-empty name (defensive — protects
// against legacy/malformed records that would otherwise render as a
// "null" option in the dropdown).
const teachersApi = async (req, res) => {
  try {
    const teachers = await User.find({
      role: 'Teacher',
      name: { $exists: true, $type: 'string', $ne: '' }
    })
      .select('_id name')
      .sort({ name: 1 });

    const valid = teachers.filter(
      (t) => typeof t.name === 'string' && t.name.trim().length > 0
    );

    res.json(valid);
  } catch (err) {
    console.error('Error fetching teachers:', err);
    res.status(500).json({ error: 'Failed to fetch teachers' });
  }
};


module.exports = { 
  upload,
  upload_get, 
  upload_post, 
  myTheses, 
  myThesesApi, 
  allApproved, 
  allApprovedApi, 
  detail, 
  detailApi,
  reviewerPending,
  reviewerPendingApi,
  adminPending,
  adminPendingApi,
  edit_get,
  edit_post,
  delete_post,
  approve_post,
  reject_post,
  revoke_post,
  teachersApi
};
