const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: [true, 'Name is required'], 
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long'],
      maxlength: [50, 'Name cannot exceed 50 characters']
    },
    email: { 
      type: String, 
      required: [true, 'Email is required'], 
      unique: true, 
      lowercase: true, 
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
    },
    password: { 
      type: String, 
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters long']
    },
    role: { 
      type: String, 
      enum: {
        values: ['Student', 'Teacher', 'Admin'],
        message: 'Role must be Student, Teacher, or Admin'
      }, 
      default: 'Student' 
    },
    profilePicture: {
      type: String,
      default: null
    },
    profilePicturePublicId: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  try {
    if (!this.isModified('password')) return next();
    
    // Prevent double hashing if the password is already a bcrypt hash
    if (typeof this.password === 'string' && this.password.startsWith('$2')) {
      return next();
    }
    
    const saltRounds = 12; // Increased security
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Optional helper: detect if stored password is already bcrypt-hashed
userSchema.methods.isPasswordHashed = function(){
  return typeof this.password === 'string' && this.password.startsWith('$2');
};

// Attempt legacy plaintext match then migrate to bcrypt
userSchema.methods.compareOrMigratePassword = async function(candidate) {
  // If hashed, do normal compare
  if (this.isPasswordHashed()) {
    return bcrypt.compare(candidate, this.password);
  }
  // Fallback: plaintext equal
  if (candidate === this.password) {
    // Set to plaintext and let the pre-save hook hash it
    this.password = candidate;
    this.markModified('password');
    await this.save();
    return true;
  }
  return false;
};

module.exports = mongoose.model('User', userSchema);


