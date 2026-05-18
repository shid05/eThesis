const mongoose = require('mongoose');
const crypto = require('crypto');

const thesisRequestSchema = new mongoose.Schema(
  {
    thesis: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Thesis',
      required: true
    },
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    reason: {
      type: String,
      required: [true, 'Reason for request is required'],
      trim: true,
      minlength: [20, 'Please provide at least 20 characters explaining your reason']
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'fulfilled'],
      default: 'pending'
    },
    approvalToken: {
      type: String,
      unique: true,
      sparse: true
    },
    tokenExpiresAt: { type: Date },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    fulfilledAt: { type: Date }
  },
  { timestamps: true }
);

thesisRequestSchema.index({ thesis: 1, requester: 1 });
thesisRequestSchema.index({ approvalToken: 1 });
thesisRequestSchema.index({ status: 1, createdAt: -1 });

thesisRequestSchema.statics.generateToken = function () {
  return crypto.randomBytes(32).toString('hex');
};

module.exports = mongoose.model('ThesisRequest', thesisRequestSchema);
