const mongoose = require('mongoose');

const thesisSchema = new mongoose.Schema(
  {
    title: { 
      type: String, 
      required: [true, 'Title is required'], 
      unique: true,
      trim: true,
      minlength: [10, 'Title must be at least 10 characters long'],
      maxlength: [200, 'Title cannot exceed 200 characters']
    },
    abstract: { 
      type: String, 
      required: [true, 'Abstract is required'], 
      trim: true,
      minlength: [100, 'Abstract must be at least 100 characters long'],
      maxlength: [2000, 'Abstract cannot exceed 2000 characters']
    },
    fileUrl: { 
      type: String, 
      required: [true, 'File URL or path is required'], 
      trim: true
    },
    category: {
      type: String,
      enum: {
        values: ['Thesis', 'Capstone', 'Research'],
        message: 'Category must be Thesis, Capstone, or Research'
      },
      default: 'Thesis'
    },
    course: {
      type: String,
      trim: true,
      default: ''
    },
    adviser: {
      type: String,
      trim: true,
      default: ''
    },
    authorsName: {
      type: String,
      trim: true,
      default: ''
    },
    yearPublished: {
      type: String,
      trim: true,
      default: ''
    },
    author: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: [true, 'Author is required']
    },
    status: { 
      type: String, 
      enum: {
        values: ['Pending', 'Approved', 'Rejected'],
        message: 'Status must be Pending, Approved, or Rejected'
      }, 
      default: 'Pending' 
    },
    rejectionReason: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

// Index for better performance
thesisSchema.index({ author: 1, status: 1 });
thesisSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Thesis', thesisSchema);


