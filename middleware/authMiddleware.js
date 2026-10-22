import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Admin from '../models/admin.model.js';
import Student from '../models/student.model.js';
import AppError from '../utils/appError.js';
import { isMongoUnavailable } from '../utils/dbAvailability.js';
import { getFirebaseAdmin } from '../config/firebase.js';
import StudentSession from '../models/studentSession.model.js';
import {
  clearStudentSessionCookie,
  hashStudentSessionToken,
  readStudentSessionToken,
} from '../utils/studentSession.js';

// Verify admin JWT authentication token and account status
export const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('You are not logged in. Please log in to get access.', 401));
    }

    if (!process.env.JWT_SECRET) {
      return next(new AppError('Server authentication configuration error.', 500));
    }
 
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (mongoose.connection.readyState !== 1) {
      return next(new AppError('MongoDB is unavailable. Please retry when the teacher server is online.', 503));
    }

    const admin = await Admin.findById(decoded.id);
    if (!admin) {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }

    if (!admin.isActive) {
      return next(new AppError('This account has been deactivated.', 401));
    }

    if (admin.changedPasswordAfter(decoded.iat)) {
      return next(new AppError('User recently changed password! Please log in again.', 401));
    }

    if (admin.accountLockedUntil && admin.accountLockedUntil > Date.now()) {
      return next(new AppError('Account is temporarily locked. Please try again later.', 401));
    }

    req.admin = admin;
    next();
  } catch (error) {
    if (isMongoUnavailable(error)) {
      return next(new AppError('MongoDB is unavailable. Please retry when the teacher server is online.', 503));
    }
    next(new AppError('Invalid or expired token. Please log in again.', 401));
  }
};

// Restrict endpoint access to specific authorized user roles
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      return next(new AppError('You do not have permission to perform this action.', 403));
    }
    next();
  };
};

// Verify student JWT authentication token and active status
export const verifyStudent = async (req, res, next) => {
  try {
    const sessionToken = readStudentSessionToken(req);
    if (!sessionToken) {
      return next(new AppError('You are not logged in. Please log in to get access.', 401));
    }

    const session = await StudentSession.findOne({
      tokenHash: hashStudentSessionToken(sessionToken),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    }).select('studentId');
    if (!session) {
      clearStudentSessionCookie(res);
      return next(new AppError('Your student session has expired. Please sign in again.', 401));
    }
    const student = await Student.findById(session.studentId);

    if (!student) {
      clearStudentSessionCookie(res);
      return next(new AppError('The student belonging to this session no longer exists.', 401));
    }

    if (student.status !== 'active') {
      clearStudentSessionCookie(res);
      return next(new AppError('Your account is not active. Please contact support.', 401));
    }

    req.student = student;
    next();
  } catch (error) {
    if (isMongoUnavailable(error)) {
      return next(new AppError('MongoDB is unavailable. Please retry when the teacher server is online.', 503));
    }
    clearStudentSessionCookie(res);
    next(new AppError('Invalid or expired token. Please log in again.', 401));
  }
};

export const verifyFirebaseStudentToken = async (req, res, next) => {
  const sessionToken = readStudentSessionToken(req);
  if (sessionToken) {
    try {
      const session = await StudentSession.findOne({
        tokenHash: hashStudentSessionToken(sessionToken),
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      }).select('studentId');
      if (!session) {
        clearStudentSessionCookie(res);
        return next(new AppError('Your student session has expired. Please sign in again.', 401));
      }
      const student = await Student.findById(session.studentId).select('_id status');
      if (!student || student.status !== 'active') {
        clearStudentSessionCookie(res);
        return next(new AppError('Your student account is not active. Please contact support.', 401));
      }
      req.firebaseStudent = { uid: String(session.studentId), role: 'student' };
      return next();
    } catch (error) {
      if (isMongoUnavailable(error)) {
        return next(new AppError('MongoDB is unavailable. Please retry when the teacher server is online.', 503));
      }
      clearStudentSessionCookie(res);
      return next(new AppError('Invalid or expired student session.', 401));
    }
  }

  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;
  if (!token) {
      return next(new AppError('You are not logged in. Please log in to get access.', 401));
  }

  try {
    const firebase = getFirebaseAdmin();
    if (!firebase) {
      return next(new AppError('Student data service is not configured. Please contact your teacher.', 503));
    }
    const decoded = await firebase.auth.verifyIdToken(token, true);
    if (decoded.role !== 'student') {
      return next(new AppError('Student access is required for this resource.', 403));
    }
    req.firebaseStudent = decoded;
    return next();
  } catch {
    return next(new AppError('Your student sign-in has expired. Please sign in again.', 401));
  }
};

// Verify that the authenticated user possesses admin or superadmin privileges
export const isAdmin = (req, res, next) => {
  try {
    if (!req.admin) {
      return res.status(401).json({ status: 'fail', message: 'Not authenticated' });
    }
    
    if (req.admin.role !== 'admin' && req.admin.role !== 'superadmin') {
      return res.status(403).json({ status: 'fail', message: 'Admin access required' });
    }
    
    next();
  } catch {
    res.status(500).json({ status: 'error', message: 'Server authorization error' });
  }
};

// Centralized Express error handling middleware
export const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      stack: err.stack
    });
  } else {
    // Production mode: never leak internal exceptions or database traces
    if (err.isOperational) {
      res.status(err.statusCode).json({
        status: err.status,
        message: err.message
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
};
