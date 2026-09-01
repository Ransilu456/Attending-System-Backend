import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect, isAdmin } from '../middleware/authMiddleware.js';
import { validateAdminInput, validateStudentInput, validateStudentUpdateInput } from '../middleware/validationMiddleware.js';
import {
  registerAdmin,
  loginAdmin,
  getAdminDetails,
  getStudents,
  updateStudent,
  deleteStudent,
  getAllStudents,
  forgotPassword,
  resetPassword,
  updatePassword,
  updateProfile,
  registerStudent,
  generateStudentQRCode,
  getRecentAttendance,
  logoutAdmin,
  getStudentQRByIndex
} from '../controllers/admin.controller.js';

const router = express.Router();

// Rate limiter for admin login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { status: 'fail', message: 'Too many login attempts. Please try again after 15 minutes.' }
});

// Rate limiter for student registration
const studentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { status: 'fail', message: 'Too many student registration attempts. Please try again later.' }
});

// Admin authentication & account recovery routes
router.post('/register', validateAdminInput, registerAdmin);
router.post('/login', loginLimiter, loginAdmin);
router.post('/logout', logoutAdmin);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.post('/update-password', protect, updatePassword);
router.patch('/profile', protect, updateProfile);
router.get('/me', protect, getAdminDetails);

// Student management routes (admin protected)
router.get('/students', protect, isAdmin, getStudents);
router.get('/students/all', protect, isAdmin, getAllStudents);
router.post('/students', protect, isAdmin, studentLimiter, validateStudentInput, registerStudent);
router.put('/students/:id', protect, isAdmin, validateStudentInput, updateStudent);
router.patch('/students/:id', protect, isAdmin, validateStudentUpdateInput, updateStudent);
router.delete('/students/:id', protect, isAdmin, deleteStudent);

// Student QR code generation routes (admin protected)
router.get('/students/:id/qr-code', protect, isAdmin, generateStudentQRCode);
router.get('/students/qr-code/:indexNumber', protect, isAdmin, getStudentQRByIndex);

// Attendance overview route (admin protected)
router.get('/attendance/recent', protect, isAdmin, getRecentAttendance);

export default router;
