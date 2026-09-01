import express from 'express';
import rateLimit from 'express-rate-limit';
import { validateStudentUpdateInput } from '../middleware/validationMiddleware.js';
import { protect, restrictTo, verifyStudent } from '../middleware/authMiddleware.js';
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

const qrLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many QR code requests. Please try again later.'
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again later.'
});

// ─── Admin-protected student routes ─────────────────────────────────────────
router.get('/profile/:studentId', protect, getStudentProfile);
router.patch('/profile/:studentId', protect, validateStudentUpdateInput, updateStudentProfile);
router.get('/attendance-history/:studentId', protect, getAttendanceHistory);
router.get('/attendance-history', protect, getAttendanceHistory);
router.get('/dashboard-stats', protect, restrictTo('admin'), getDashboardStats);

// ─── Public routes ────────────────────────────────────────────────────────────
router.get('/download-qr-code', qrLimiter, downloadQRCode);
router.get('/search-qr', qrLimiter, searchQRCode);

// ─── Student authentication routes ───────────────────────────────────────────
router.post('/login', loginLimiter, studentLogin);

// ─── Student self-service routes (protected by verifyStudent) ────────────────
router.get('/me', verifyStudent, getMyProfile);
router.patch('/me', verifyStudent, validateStudentUpdateInput, updateMyProfile);
router.get('/me/attendance', verifyStudent, getMyAttendance);

export default router;
