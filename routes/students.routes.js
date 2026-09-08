import express from 'express';
import rateLimit from 'express-rate-limit';
import { validateStudentUpdateInput } from '../middleware/validationMiddleware.js';
import { protect, isAdmin, verifyStudent } from '../middleware/authMiddleware.js';
import {
  downloadQRCode,
  searchQRCode,
  getStudentProfile,
  updateStudentProfile,
  getAttendanceHistory,
  getDashboardStats,
  studentLogin,
  getMyProfile,
  getMyAttendance,
  updateMyProfile,
} from '../controllers/students.controller.js';

const router = express.Router();

// Rate limiter for QR downloads
const qrLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { status: 'fail', message: 'Too many QR code requests. Please try again later.' }
});

// Rate limiter for student login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    const resetTime = req.rateLimit?.resetTime;
    const retryAfterSeconds = resetTime ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000)) : 900;
    res.setHeader('Retry-After', retryAfterSeconds);
    res.status(429).json({
      status: 'fail',
      success: false,
      message: 'Too many login attempts. Please try again later.',
      retryAfter: retryAfterSeconds
    });
  }
});

// Admin-managed student profile & statistics routes
router.get('/profile/:studentId', protect, isAdmin, getStudentProfile);
router.patch('/profile/:studentId', protect, isAdmin, validateStudentUpdateInput, updateStudentProfile);
router.get('/attendance-history/:studentId', protect, isAdmin, getAttendanceHistory);
router.get('/attendance-history', protect, isAdmin, getAttendanceHistory);
router.get('/dashboard-stats', protect, isAdmin, getDashboardStats);

// Public student QR lookup & download endpoints
router.get('/download-qr-code', qrLimiter, downloadQRCode);
router.get('/search-qr', qrLimiter, searchQRCode);

// Student authentication route
router.post('/login', loginLimiter, studentLogin);

// Student authenticated self-service routes
router.get('/me', verifyStudent, getMyProfile);
router.patch('/me', verifyStudent, validateStudentUpdateInput, updateMyProfile);
router.get('/me/attendance', verifyStudent, getMyAttendance);

export default router;
