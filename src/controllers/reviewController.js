const Review = require('../models/Review');
const Thesis = require('../models/Thesis');
const { createNotification } = require('../utils/notificationHelper');

// GET /reviews/add/:thesisId (page)
const add_get = async (req, res) => {
  try {
    const thesis = await Thesis.findById(req.params.thesisId);
    if (!thesis) {
      return res.status(404).send('Thesis not found');
    }
    
    if (!['Approved', 'Pending'].includes(thesis.status)) {
      return res.status(403).send('You can only review approved or pending theses');
    }
    
    const existingReview = await Review.findOne({
      thesisId: thesis._id,
      reviewerId: req.session.user.id
    });
    
    if (existingReview) {
      return res.status(400).send('You have already reviewed this thesis');
    }
    
    res.render('add_review');
  } catch (err) {
    console.error('Error accessing review form:', err);
    res.status(500).send('Server error');
  }
};

// POST /reviews/add/:thesisId
const add_post = async (req, res) => {
  try {
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

    if (!['Approved','Pending'].includes(thesis.status)) {
      return res.status(400).send('Only approved or pending theses can be reviewed');
    }
    
    const existingReview = await Review.findOne({
      thesisId: thesis._id,
      reviewerId: req.session.user.id
    });
    
    if (existingReview) {
      return res.status(400).send('You have already reviewed this thesis');
    }
    
    const review = await Review.create({ 
      thesisId: thesis._id, 
      reviewerId: req.session.user.id, 
      comment: comment.trim(), 
      rating: ratingNum 
    });
    
    // Persistent notification to thesis author
    if (thesis.author) {
      await createNotification(req.io, thesis.author, {
        type: 'info',
        title: 'New Review Received!',
        message: `Your thesis "${thesis.title}" has received a new review with ${ratingNum} stars.`
      });
    }
    
    console.log(`✅ New review added for "${thesis.title}" by ${req.session.user.name}`);
    res.redirect(`/thesis/${thesis._id}`);
  } catch (err) {
    console.error('Review creation error:', err);
    
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).send(messages.join('. '));
    }
    
    if (err.code === 11000) {
      return res.status(400).send('You have already reviewed this thesis');
    }
    
    res.status(500).send('Server error during review submission');
  }
};

// GET /reviews/edit/:thesisId (page)
const edit_get = async (req, res) => {
  try {
    const thesis = await Thesis.findById(req.params.thesisId);
    if (!thesis) {
      return res.status(404).send('Thesis not found');
    }
    
    if (!['Approved', 'Pending'].includes(thesis.status)) {
      return res.status(403).send('You can only review approved or pending theses');
    }
    
    const existingReview = await Review.findOne({
      thesisId: thesis._id,
      reviewerId: req.session.user.id
    });
    
    if (!existingReview) {
      return res.status(404).send('You have not reviewed this thesis yet. Use the add review link.');
    }
    
    res.render('edit_review');
  } catch (err) {
    console.error('Error accessing review edit form:', err);
    res.status(500).send('Server error');
  }
};

// POST /reviews/edit/:thesisId
const edit_post = async (req, res) => {
  try {
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

    if (!['Approved','Pending'].includes(thesis.status)) {
      return res.status(400).send('Only approved or pending theses can be reviewed');
    }
    
    const updatedReview = await Review.findOneAndUpdate(
      {
        thesisId: thesis._id,
        reviewerId: req.session.user.id
      },
      {
        comment: comment.trim(),
        rating: ratingNum
      },
      { new: true }
    );
    
    if (!updatedReview) {
      return res.status(404).send('Review not found. Please add a new review instead.');
    }
    
    // Persistent notification to thesis author
    if (thesis.author) {
      await createNotification(req.io, thesis.author, {
        type: 'info',
        title: 'Teacher Review Updated!',
        message: `Your thesis "${thesis.title}" review was updated with ${ratingNum} stars.`
      });
    }
    
    console.log(`✅ Teacher review updated for "${thesis.title}" by ${req.session.user.name}`);
    res.redirect(`/thesis/${thesis._id}`);
  } catch (err) {
    console.error('Review update error:', err);
    
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).send(messages.join('. '));
    }
    
    res.status(500).send('Server error during review update');
  }
};

// GET /reviews/api/edit/:thesisId (JSON - get existing review for editing)
const editApi = async (req, res) => {
  try {
    const existingReview = await Review.findOne({
      thesisId: req.params.thesisId,
      reviewerId: req.session.user.id
    }).populate('thesisId', 'title author');
    
    if (!existingReview) {
      return res.status(404).json({ error: 'Review not found' });
    }
    
    res.json(existingReview);
  } catch (err) {
    console.error('Error fetching teacher review for edit:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { 
  add_get, 
  add_post, 
  edit_get, 
  edit_post, 
  editApi 
};
