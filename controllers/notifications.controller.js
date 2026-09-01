import Notification from '../models/notification.model.js';
import Student from '../models/student.model.js';

// ─── Admin: Send a notification ──────────────────────────────────────────────
export const sendNotification = async (req, res) => {
  try {
    const { title, message, priority = 'normal', type = 'announcement', targetStudents = [] } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }

    // Validate targetStudents exist if provided
    if (targetStudents.length > 0) {
      const validStudents = await Student.find({ _id: { $in: targetStudents } }).select('_id');
      if (validStudents.length !== targetStudents.length) {
        return res.status(400).json({ success: false, message: 'One or more target students not found' });
      }
    }

    const notification = await Notification.create({
      title,
      message,
      priority,
      type,
      targetStudents,
      sentBy: req.admin._id,
    });

    return res.status(201).json({
      success: true,
      message: 'Notification sent successfully',
      notification: {
        _id: notification._id,
        title: notification.title,
        message: notification.message,
        priority: notification.priority,
        type: notification.type,
        targetStudents: notification.targetStudents,
        createdAt: notification.createdAt,
      },
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    return res.status(500).json({ success: false, message: 'Failed to send notification', error: error.message });
  }
};

// ─── Admin: Get all notifications ────────────────────────────────────────────
export const getAllNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ isActive: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sentBy', 'name email')
      .lean();

    const total = await Notification.countDocuments({ isActive: true });

    return res.status(200).json({
      success: true,
      notifications,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

// ─── Admin: Delete notification ───────────────────────────────────────────────
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findByIdAndUpdate(id, { isActive: false }, { new: true });
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    return res.status(200).json({ success: true, message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete notification' });
  }
};

// ─── Student: Get my notifications ───────────────────────────────────────────
export const getStudentNotifications = async (req, res) => {
  try {
    const studentId = req.student._id;

    // Get notifications that are either broadcast (no targetStudents) or targeted to this student
    const notifications = await Notification.find({
      isActive: true,
      $or: [
        { targetStudents: { $size: 0 } },
        { targetStudents: studentId },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Mark which are read by this student
    const result = notifications.map((n) => ({
      ...n,
      isRead: n.readBy?.some((r) => r.student?.toString() === studentId.toString()) ?? false,
    }));

    const unreadCount = result.filter((n) => !n.isRead).length;

    return res.status(200).json({
      success: true,
      notifications: result,
      unreadCount,
    });
  } catch (error) {
    console.error('Error fetching student notifications:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

// ─── Student: Mark notification as read ──────────────────────────────────────
export const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const studentId = req.student._id;

    await Notification.updateOne(
      {
        _id: id,
        isActive: true,
        'readBy.student': { $ne: studentId },
      },
      {
        $push: {
          readBy: { student: studentId, readAt: new Date() },
        },
      }
    );

    return res.status(200).json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return res.status(500).json({ success: false, message: 'Failed to mark notification as read' });
  }
};

// ─── Student: Mark all as read ────────────────────────────────────────────────
export const markAllNotificationsRead = async (req, res) => {
  try {
    const studentId = req.student._id;

    await Notification.updateMany(
      {
        isActive: true,
        $or: [
          { targetStudents: { $size: 0 } },
          { targetStudents: studentId },
        ],
        'readBy.student': { $ne: studentId },
      },
      {
        $push: {
          readBy: { student: studentId, readAt: new Date() },
        },
      }
    );

    return res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return res.status(500).json({ success: false, message: 'Failed to mark notifications as read' });
  }
};

// ─── Public: Get announcements ───────────────────────────────────────────────
export const getPublicAnnouncements = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      announcements: [],
    });
  } catch (error) {
    console.error('Error fetching public announcements:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch announcements' });
  }
};

export default {
  sendNotification,
  getAllNotifications,
  deleteNotification,
  getStudentNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getPublicAnnouncements,
};
