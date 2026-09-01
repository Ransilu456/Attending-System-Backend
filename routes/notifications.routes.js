import express from 'express';
import rateLimit from 'express-rate-limit';
import { protect } from '../middleware/authMiddleware.js';
import { verifyStudent } from '../middleware/authMiddleware.js';
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

const notifLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: 'Too many notification requests. Please try again later.',
});

// ─── Public routes ────────────────────────────────────────────────────────────
router.get('/public', getPublicAnnouncements);

// ─── Admin routes (protected) ─────────────────────────────────────────────────
router.post('/', protect, sendNotification);
router.get('/', protect, getAllNotifications);
router.delete('/:id', protect, deleteNotification);

// ─── Student routes (student auth) ───────────────────────────────────────────
router.get('/student/me', notifLimiter, verifyStudent, getStudentNotifications);
router.patch('/student/:id/read', notifLimiter, verifyStudent, markNotificationRead);
router.patch('/student/read-all', notifLimiter, verifyStudent, markAllNotificationsRead);

export default router;
