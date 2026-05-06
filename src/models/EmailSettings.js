const mongoose = require('mongoose');
const crypto = require('crypto');

// Encryption key - should be stored in environment variable in production
const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY || 'eThesis-email-settings-encryption-key-32'; // Must be 32 characters
const IV_LENGTH = 16;

// Encryption functions
function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').substring(0, 32));
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  if (!text) return '';
  try {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').substring(0, 32));
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error('Decryption error:', error);
    return '';
  }
}

const emailSettingsSchema = new mongoose.Schema(
  {
    // Only one settings document should exist (singleton pattern)
    _id: {
      type: String,
      default: 'email_settings'
    },
    
    // Email configuration
    isConfigured: {
      type: Boolean,
      default: false
    },
    
    smtpHost: {
      type: String,
      default: 'smtp.gmail.com'
    },
    
    smtpPort: {
      type: Number,
      default: 587
    },
    
    smtpSecure: {
      type: Boolean,
      default: false // true for 465, false for other ports
    },
    
    emailUser: {
      type: String,
      required: [true, 'Email address is required'],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
    },
    
    emailPassword: {
      type: String,
      required: [true, 'Email password/app password is required']
    },
    
    emailFrom: {
      type: String,
      trim: true
    },
    
    // Admin who configured the email
    configuredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    
    // Test email status
    lastTestAt: {
      type: Date
    },
    
    lastTestStatus: {
      type: String,
      enum: ['success', 'failed'],
      default: null
    },
    
    lastTestError: {
      type: String
    }
  },
  { timestamps: true }
);

// Encrypt password before saving
emailSettingsSchema.pre('save', function(next) {
  if (this.isModified('emailPassword') && this.emailPassword) {
    // Only encrypt if not already encrypted (doesn't contain ':')
    if (!this.emailPassword.includes(':')) {
      this.emailPassword = encrypt(this.emailPassword);
    }
  }
  
  // Set isConfigured to true if email and password are provided
  if (this.emailUser && this.emailPassword) {
    this.isConfigured = true;
  }
  
  // Set emailFrom if not provided
  if (!this.emailFrom && this.emailUser) {
    this.emailFrom = this.emailUser;
  }
  
  next();
});

// Method to get decrypted password
emailSettingsSchema.methods.getDecryptedPassword = function() {
  return decrypt(this.emailPassword);
};

// Method to test email configuration
emailSettingsSchema.methods.testConnection = async function() {
  try {
    const nodemailer = require('nodemailer');
    
    // Get decrypted password
    const decryptedPassword = this.getDecryptedPassword();
    
    if (!decryptedPassword) {
      throw new Error('Password decryption failed');
    }
    
    // Create transporter with proper configuration
    const transporter = nodemailer.createTransport({
      host: this.smtpHost || 'smtp.gmail.com',
      port: this.smtpPort || 587,
      secure: this.smtpSecure || false, // true for 465, false for other ports
      auth: {
        user: this.emailUser,
        pass: decryptedPassword
      },
      // Add timeout and connection options
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000,
      socketTimeout: 10000
    });
    
    // Verify connection
    await transporter.verify();
    
    // Update test status
    this.lastTestAt = new Date();
    this.lastTestStatus = 'success';
    this.lastTestError = null;
    await this.save();
    
    return { 
      success: true, 
      message: 'Email configuration is valid and connection successful' 
    };
  } catch (error) {
    // Update test status with error
    this.lastTestAt = new Date();
    this.lastTestStatus = 'failed';
    this.lastTestError = error.message || 'Unknown error';
    
    // Try to save, but don't fail if save fails
    try {
      await this.save();
    } catch (saveError) {
      console.error('Error saving test status:', saveError);
    }
    
    // Return detailed error
    let errorMessage = error.message || 'Connection test failed';
    
    // Provide helpful error messages
    if (errorMessage.includes('Invalid login')) {
      errorMessage = 'Invalid email or password. Please check your Gmail App Password.';
    } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ETIMEDOUT')) {
      errorMessage = 'Connection failed. Please check your internet connection and SMTP settings.';
    } else if (errorMessage.includes('EAUTH')) {
      errorMessage = 'Authentication failed. Please verify your Gmail App Password is correct.';
    }
    
    return { 
      success: false, 
      error: errorMessage 
    };
  }
};

module.exports = mongoose.model('EmailSettings', emailSettingsSchema);

