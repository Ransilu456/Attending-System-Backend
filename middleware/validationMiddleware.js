import { validationResult, body, param, query } from 'express-validator';
import { resolveId } from '../utils/idMask.js';

// Inspect validation results and return formatted error messages
export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorList = errors.array().map(err => ({ field: err.path, message: err.msg }));
    // Never log user input — only field names
    return res.status(400).json({
      status: 'fail',
      message: 'Validation failed',
      errors: errorList
    });
  }
  next();
};

// Validation rules for administrator registration and credentials
export const validateAdminInput = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s'.,-]+$/).withMessage('Name contains invalid characters')
    .escape(),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .isLength({ max: 254 }).withMessage('Email is too long')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters')
    .matches(/\d/).withMessage('Password must contain at least one number')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain at least one special character'),

  body('role')
    .optional()
    .isIn(['admin', 'superadmin']).withMessage('Invalid role'),

  validateRequest
];

// Validation rules for creating a new student record
export const validateStudentInput = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s'.,-]+$/).withMessage('Name contains invalid characters')
    .escape(),

  body('address')
    .trim()
    .notEmpty().withMessage('Address is required')
    .isLength({ min: 5, max: 200 }).withMessage('Address must be between 5 and 200 characters'),

  body('student_email')
    .trim()
    .notEmpty().withMessage('Student email is required')
    .isEmail().withMessage('Please provide a valid email')
    .isLength({ max: 254 }).withMessage('Email is too long')
    .normalizeEmail(),

  body('parent_email')
    .trim()
    .notEmpty().withMessage('Parent email is required')
    .isEmail().withMessage('Please provide a valid parent email')
    .isLength({ max: 254 }).withMessage('Email is too long')
    .normalizeEmail(),

  body('parent_telephone')
    .trim()
    .notEmpty().withMessage('Parent telephone is required')
    .matches(/^\+?[\d\s\-()]{7,20}$/).withMessage('Please provide a valid phone number (7-20 digits)'),

  body('indexNumber')
    .trim()
    .notEmpty().withMessage('Index number is required')
    .isLength({ min: 2, max: 20 }).withMessage('Index number must be 2-20 characters')
    .matches(/^[A-Za-z0-9]+$/).withMessage('Index number must contain only alphanumeric characters'),

  body('dateOfBirth')
    .notEmpty().withMessage('Date of birth is required')
    .isISO8601().withMessage('Please provide a valid date (YYYY-MM-DD)')
    .custom((value) => {
      const dob = new Date(value);
      const now = new Date();
      const minAge = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());
      const maxAge = new Date(now.getFullYear() - 100, now.getMonth(), now.getDate());
      if (dob >= now) throw new Error('Date of birth must be in the past');
      if (dob < maxAge) throw new Error('Date of birth is unrealistic');
      return true;
    }),

  validateRequest
];

// Validation rules for updating an existing student record
export const validateStudentUpdateInput = [
  body('name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s'.,-]+$/).withMessage('Name contains invalid characters')
    .escape(),

  body('address')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 5, max: 200 }).withMessage('Address must be between 5 and 200 characters'),

  body('student_email')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail().withMessage('Please provide a valid email')
    .isLength({ max: 254 }).withMessage('Email is too long')
    .normalizeEmail(),

  body('parent_email')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail().withMessage('Please provide a valid parent email')
    .isLength({ max: 254 }).withMessage('Email is too long')
    .normalizeEmail(),

  body('parent_telephone')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^\+?[\d\s\-()]{7,20}$/).withMessage('Please provide a valid phone number'),

  body('indexNumber')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 20 }).withMessage('Index number must be 2-20 characters')
    .matches(/^[A-Za-z0-9]+$/).withMessage('Index number must contain only alphanumeric characters'),

  body('dateOfBirth')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('Please provide a valid date (YYYY-MM-DD)')
    .custom((value) => {
      if (!value) return true;
      const dob = new Date(value);
      if (dob >= new Date()) throw new Error('Date of birth must be in the past');
      return true;
    }),

  body('profileImage')
    .optional()
    .custom((value) => {
      if (!value) return true;
      if (typeof value !== 'string') throw new Error('Profile image must be a base64 string or URL');
      if (value.length > 2 * 1024 * 1024) throw new Error('Profile image is too large (max 2MB)');
      return true;
    }),

  validateRequest
];

// Validation rules for attendance scan payloads
export const validateAttendanceInput = [
  body('qrCodeData')
    .trim()
    .notEmpty().withMessage('QR code data is required')
    .isLength({ min: 1, max: 500 }).withMessage('QR code data is invalid'),

  validateRequest
];

// Validation rules for login credentials
export const validateLoginInput = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 1, max: 128 }).withMessage('Password is too long'),

  validateRequest
];

// Validation rules for student login
export const validateStudentLoginInput = [
  body('student_email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),

  body('indexNumber')
    .trim()
    .notEmpty().withMessage('Index number is required')
    .isLength({ min: 2, max: 20 }).withMessage('Index number must be 2-20 characters')
    .matches(/^[A-Za-z0-9]+$/).withMessage('Index number must contain only alphanumeric characters'),

  validateRequest
];

// Validation rules for password update
export const validatePasswordUpdate = [
  body('currentPassword')
    .notEmpty().withMessage('Current password is required'),

  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters')
    .matches(/\d/).withMessage('Password must contain at least one number')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain at least one special character'),

  validateRequest
];

// Validation rules for forgot password request
export const validateForgotPassword = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),

  validateRequest
];

// Validation rules for reset password
export const validateResetPassword = [
  body('password')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters')
    .matches(/\d/).withMessage('Password must contain at least one number')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain at least one special character'),

  validateRequest
];

// Validate MongoDB ObjectId URL params (supports raw ObjectId or masked token) and resolves to raw ObjectId
export const validateMongoId = (paramName = 'id') => [
  (req, res, next) => {
    const rawVal = req.params[paramName];
    const resolved = resolveId(rawVal);
    if (!resolved || !/^[a-fA-F0-9]{24}$/.test(resolved)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid ID format'
      });
    }
    req.params[paramName] = resolved;
    next();
  }
];

// Validate date range query params
export const validateDateRange = [
  query('startDate')
    .optional()
    .isISO8601().withMessage('startDate must be a valid ISO date (YYYY-MM-DD)'),

  query('endDate')
    .optional()
    .isISO8601().withMessage('endDate must be a valid ISO date (YYYY-MM-DD)'),

  validateRequest
];
