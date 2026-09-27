import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect, isAdmin } from '../middleware/authMiddleware.js';
import { validateMongoId } from '../middleware/validationMiddleware.js';
import { markAttendanceQR, getStudentQRCode, saveQRCode } from '../controllers/qrScanner.controller.js';

const router = express.Router();

// Rate limiter for QR scanning attempts
const scanLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 60, 
  message: { status: 'fail', message: 'Too many QR scan attempts. Please slow down.' }
});

// QR attendance processing route 
router.post('/markAttendanceQR', protect, scanLimiter, markAttendanceQR);

// QR data retrieval and storage routes 
router.get('/student/:studentId', protect, isAdmin, ...validateMongoId('studentId'), getStudentQRCode);
router.post('/student/:studentId', protect, isAdmin, ...validateMongoId('studentId'), saveQRCode);

export default router;