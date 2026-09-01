import express from 'express';
import { protect, isAdmin } from '../middleware/authMiddleware.js';
import {
  configureAutoCheckout,
  getAutoCheckoutSettings,
  runAutoCheckout,
  getScannedStudentsToday,
  getAttendanceByDate,
  getStudentAttendanceHistory,
  clearStudentAttendanceHistory,
  deleteAttendanceRecord
} from '../controllers/attendance.controller.js';

const router = express.Router();

// Auto-checkout configuration routes (admin protected)
router.post('/auto-checkout/configure', protect, isAdmin, configureAutoCheckout);
router.get('/auto-checkout/settings', protect, isAdmin, getAutoCheckoutSettings);
router.post('/auto-checkout/run', protect, isAdmin, runAutoCheckout);

// Daily and historical attendance query routes
router.get('/today', protect, isAdmin, getScannedStudentsToday);
router.get('/date/:date', protect, isAdmin, getAttendanceByDate);
router.get('/:date', protect, isAdmin, getAttendanceByDate);

// Student attendance management & cleanup routes (admin protected)
router.get('/student/:studentId/history', protect, isAdmin, getStudentAttendanceHistory);
router.delete('/student/:studentId/clear', protect, isAdmin, clearStudentAttendanceHistory);
router.delete('/student/:studentId/record/:recordId', protect, isAdmin, deleteAttendanceRecord);

export default router;