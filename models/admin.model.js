import mongoose from 'mongoose';
import bcrypt from 'bcryptjs'; 
import validator from 'validator';
import crypto from 'crypto';

// Admin user schema definition
const adminSchema = new mongoose.Schema(
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
      validate: [validator.isEmail, 'Please provide a valid email']
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters long'],
      select: false 
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'superadmin'],
        message: 'Role must be admin or superadmin'
      },
      default: 'admin'
    },
    lastLogin: {
      type: Date
    },
    isActive: {
      type: Boolean,
      default: true
    },
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    failedLoginAttempts: {
      type: Number,
      default: 0
    },
    accountLockedUntil: Date
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Hash password prior to saving document if modified
adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Update passwordChangedAt timestamp on password update
adminSchema.pre('save', function(next) {
  if (!this.isModified('password') || this.isNew) return next();
  
  this.passwordChangedAt = Date.now() - 1000;
  next();
});

// Compare entered plaintext password with stored bcrypt hash
adminSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Check if password was changed after token issuance
adminSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Generate and hash a secure password reset token
adminSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;
  
  return resetToken;
};

// Increment failed login counter and lock account for 30 minutes after 5 attempts
adminSchema.methods.handleFailedLogin = async function() {
  this.failedLoginAttempts += 1;
  
  if (this.failedLoginAttempts >= 5) {
    this.accountLockedUntil = Date.now() + 30 * 60 * 1000;
  }
  
  await this.save();
};

// Reset failed login counter and update last login timestamp on success
adminSchema.methods.handleSuccessfulLogin = async function() {
  this.failedLoginAttempts = 0;
  this.lastLogin = Date.now();
  this.accountLockedUntil = undefined;
  await this.save();
};

const Admin = mongoose.model('Admin', adminSchema);

export default Admin;
