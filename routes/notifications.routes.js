import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect, isAdmin, verifyStudent } from '../middleware/authMiddleware.js';
import {
  sendNotification,
  getAllNotifications,
  deleteNotification,
  getStudentNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getPublicAnnouncements,
} from '../controllers/notifications.controller.js';

const router = express.Router();

// Rate limiter for student notification requests
const notifLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { status: 'fail', message: 'Too many notification requests. Please try again later.' },
});

// Public notification routes
router.get('/public', getPublicAnnouncements);

// Administrator notification routes (admin protected)
router.post('/', protect, isAdmin, sendNotification);
router.get('/', protect, isAdmin, getAllNotifications);
router.delete('/:id', protect, isAdmin, deleteNotification);

// Student self-service notification routes (student token protected)
router.get('/student/me', notifLimiter, verifyStudent, getStudentNotifications);
router.patch('/student/:id/read', notifLimiter, verifyStudent, markNotificationRead);
router.patch('/student/read-all', notifLimiter, verifyStudent, markAllNotificationsRead);

export default router;
