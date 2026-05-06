const mongoose = require('mongoose');
const crypto = require('crypto');

const accountRetrievalSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      minlength: [2, 'First name must be at least 2 characters long'],
      maxlength: [50, 'First name cannot exceed 50 characters']
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      minlength: [2, 'Last name must be at least 2 characters long'],
      maxlength: [50, 'Last name cannot exceed 50 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending'
    },
    resetToken: {
      type: String,
      default: null
    },
    resetTokenExpires: {
      type: Date,
      default: null
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    processedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

/**
 * Generate a secure, time-limited reset token.
 * Token is valid for 1 hour.
 */
accountRetrievalSchema.methods.generateResetToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.resetToken = crypto.createHash('sha256').update(token).digest('hex');
  this.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  return token; // Return the unhashed token (sent via email)
};

/**
 * Find a retrieval request by its unhashed token.
 */
accountRetrievalSchema.statics.findByToken = function (token) {
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  return this.findOne({
    resetToken: hashed,
    resetTokenExpires: { $gt: Date.now() },
    status: 'Approved'
  });
};

module.exports = mongoose.model('AccountRetrieval', accountRetrievalSchema);
