const mongoose = require('mongoose');

const studentRatingSchema = new mongoose.Schema(
  {
    thesisId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Thesis', 
      required: [true, 'Thesis ID is required']
    },
    studentId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: [true, 'Student ID is required']
    },
    rating: { 
      type: Number, 
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5']
    },
    comment: { 
      type: String, 
      required: [true, 'Comment is required'], 
      trim: true,
      minlength: [10, 'Comment must be at least 10 characters long'],
      maxlength: [1000, 'Comment cannot exceed 1000 characters']
    }
  },
  { timestamps: true }
);

// Compound index to ensure one rating per student per thesis
studentRatingSchema.index({ thesisId: 1, studentId: 1 }, { unique: true });

// Index for better performance
studentRatingSchema.index({ thesisId: 1, createdAt: -1 });

module.exports = mongoose.model('StudentRating', studentRatingSchema);

