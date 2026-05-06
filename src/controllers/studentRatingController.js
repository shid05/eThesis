const StudentRating = require('../models/StudentRating');
const Thesis = require('../models/Thesis');
const { createNotification } = require('../utils/notificationHelper');

// GET /student-ratings/add/:thesisId (page)
const add_get = async (req, res) => {
  try {
    const thesis = await Thesis.findById(req.params.thesisId);
    if (!thesis) {
      return res.status(404).send('Thesis not found');
    }
    
    if (thesis.status !== 'Approved') {
      return res.status(403).send('You can only rate approved theses');
    }

    if (thesis.author?.toString() === req.session.user.id) {
      return res.status(403).send('You cannot rate your own thesis');
    }
    
    const existingRating = await StudentRating.findOne({
      thesisId: thesis._id,
      studentId: req.session.user.id
    });
    
    if (existingRating) {
      return res.status(400).send('You have already rated this thesis. Use the edit link to modify your rating.');
    }
    
    res.render('add_student_rating');
  } catch (err) {
    console.error('Error accessing student rating form:', err);
    res.status(500).send('Server error');
  }
};

// GET /student-ratings/edit/:thesisId (page)
const edit_get = async (req, res) => {
  try {
    const thesis = await Thesis.findById(req.params.thesisId);
    if (!thesis) {
      return res.status(404).send('Thesis not found');
    }
    
    if (thesis.status !== 'Approved') {
      return res.status(403).send('You can only rate approved theses');
    }

    if (thesis.author?.toString() === req.session.user.id) {
      return res.status(403).send('You cannot rate your own thesis');
    }
    
    const existingRating = await StudentRating.findOne({
      thesisId: thesis._id,
      studentId: req.session.user.id
    });
    
    if (!existingRating) {
      return res.status(404).send('You have not rated this thesis yet. Use the add rating link.');
    }
    
    res.render('edit_student_rating');
  } catch (err) {
    console.error('Error accessing student rating edit form:', err);
    res.status(500).send('Server error');
  }
};

// POST /student-ratings/add/:thesisId
const add_post = async (req, res) => {
  try {
    if (req.session?.user?.role !== 'Student') {
      return res.status(403).send('Only students can submit ratings');
    }

    const { comment, rating } = req.body;
    
    if (!comment || !rating) {
      return res.status(400).send('All fields are required');
    }
    
    const ratingNum = Number(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).send('Rating must be between 1 and 5');
    }
    
    const thesis = await Thesis.findById(req.params.thesisId);
    if (!thesis) {
      return res.status(404).send('Thesis not found');
    }

    if (thesis.status !== 'Approved') {
      return res.status(400).send('Only approved theses can be rated');
    }

    if (thesis.author?.toString() === req.session.user.id) {
      return res.status(403).send('You cannot rate your own thesis');
    }
    
    const existingRating = await StudentRating.findOne({
      thesisId: thesis._id,
      studentId: req.session.user.id
    });
    
    if (existingRating) {
      return res.status(400).send('You have already rated this thesis');
    }
    
    const studentRating = await StudentRating.create({ 
      thesisId: thesis._id, 
      studentId: req.session.user.id, 
      comment: comment.trim(), 
      rating: ratingNum 
    });
    
    // Persistent notification to thesis author
    if (thesis.author) {
      await createNotification(req.io, thesis.author, {
        type: 'info',
        title: 'New Student Rating!',
        message: `Your thesis "${thesis.title}" received a new student rating: ${ratingNum} stars.`
      });
    }
    
    console.log(`✅ New student rating added for "${thesis.title}" by ${req.session.user.name}`);
    res.redirect(`/thesis/${thesis._id}`);
  } catch (err) {
    console.error('Student rating creation error:', err);
    
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).send(messages.join('. '));
    }
    
    if (err.code === 11000) {
      return res.status(400).send('You have already rated this thesis');
    }
    
    res.status(500).send('Server error during rating submission');
  }
};

// POST /student-ratings/edit/:thesisId
const edit_post = async (req, res) => {
  try {
    if (req.session?.user?.role !== 'Student') {
      return res.status(403).send('Only students can update ratings');
    }

    const { comment, rating } = req.body;
    
    if (!comment || !rating) {
      return res.status(400).send('All fields are required');
    }
    
    const ratingNum = Number(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).send('Rating must be between 1 and 5');
    }
    
    const thesis = await Thesis.findById(req.params.thesisId);
    if (!thesis) {
      return res.status(404).send('Thesis not found');
    }

    if (thesis.status !== 'Approved') {
      return res.status(400).send('Only approved theses can be rated');
    }

    if (thesis.author?.toString() === req.session.user.id) {
      return res.status(403).send('You cannot rate your own thesis');
    }
    
    const updatedRating = await StudentRating.findOneAndUpdate(
      {
        thesisId: thesis._id,
        studentId: req.session.user.id
      },
      {
        comment: comment.trim(),
        rating: ratingNum
      },
      { new: true }
    );
    
    if (!updatedRating) {
      return res.status(404).send('Rating not found. Please add a new rating instead.');
    }
    
    // Persistent notification to thesis author
    if (thesis.author) {
      await createNotification(req.io, thesis.author, {
        type: 'info',
        title: 'Student Rating Updated!',
        message: `Your thesis "${thesis.title}" rating was updated: ${ratingNum} stars.`
      });
    }
    
    console.log(`✅ Student rating updated for "${thesis.title}" by ${req.session.user.name}`);
    res.redirect(`/thesis/${thesis._id}`);
  } catch (err) {
    console.error('Student rating update error:', err);
    
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).send(messages.join('. '));
    }
    
    res.status(500).send('Server error during rating update');
  }
};

// GET /student-ratings/api/:thesisId (JSON - get all ratings for a thesis)
const ratingsApi = async (req, res) => {
  try {
    const studentRatings = await StudentRating.find({ thesisId: req.params.thesisId })
      .populate('studentId', 'name')
      .sort({ createdAt: -1 });
    
    const avgRating = studentRatings.length > 0 
      ? (studentRatings.reduce((sum, rating) => sum + rating.rating, 0) / studentRatings.length).toFixed(1)
      : null;
    
    res.json({
      ratings: studentRatings,
      averageRating: avgRating,
      totalRatings: studentRatings.length
    });
  } catch (err) {
    console.error('Error fetching student ratings:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /student-ratings/api/edit/:thesisId (JSON - get existing rating for editing)
const editApi = async (req, res) => {
  try {
    const existingRating = await StudentRating.findOne({
      thesisId: req.params.thesisId,
      studentId: req.session.user.id
    }).populate('thesisId', 'title author');
    
    if (!existingRating) {
      return res.status(404).json({ error: 'Rating not found' });
    }
    
    res.json(existingRating);
  } catch (err) {
    console.error('Error fetching student rating for edit:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { 
  add_get, 
  add_post, 
  edit_get, 
  edit_post, 
  ratingsApi, 
  editApi 
};
