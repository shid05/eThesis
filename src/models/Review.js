const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    thesisId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Thesis', 
      required: [true, 'Thesis ID is required']
    },
    reviewerId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: [true, 'Reviewer ID is required']
    },
    comment: { 
      type: String, 
      required: [true, 'Comment is required'], 
      trim: true,
      minlength: [10, 'Comment must be at least 10 characters long'],
      maxlength: [1000, 'Comment cannot exceed 1000 characters']
    },
    rating: { 
      type: Number, 
      min: [1, 'Rating must be at least 1'], 
      max: [5, 'Rating cannot exceed 5'], 
      required: [true, 'Rating is required']
    }
  },
  { timestamps: true }
);

// Prevent duplicate reviews from the same reviewer for the same thesis
reviewSchema.index({ thesisId: 1, reviewerId: 1 }, { unique: true });

// Index for better performance
reviewSchema.index({ thesisId: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);


