import Notification from '../models/notification.model.js';
import Student from '../models/student.model.js';
import mongoose from 'mongoose';

// Create and broadcast/target a new notification
export const sendNotification = async (req, res) => {
  try {
    const { title, message, priority = 'normal', type = 'announcement', targetStudents = [] } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }

    if (Array.isArray(targetStudents) && targetStudents.length > 0) {
      const validStudentIds = targetStudents.filter(id => mongoose.Types.ObjectId.isValid(id));
      const validStudents = await Student.find({ _id: { $in: validStudentIds } }).select('_id');
      if (validStudents.length !== targetStudents.length) {
        return res.status(400).json({ success: false, message: 'One or more target students are invalid' });
      }
    }

    const notification = await Notification.create({
      title: title.trim(),
      message: message.trim(),
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
    return res.status(500).json({ success: false, message: 'Failed to send notification', error: error.message });
  }
};

// Retrieve paginated list of active notifications
export const getAllNotifications = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
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
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

// Deactivate a notification by ID
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid notification ID' });
    }

    const notification = await Notification.findByIdAndUpdate(id, { isActive: false }, { new: true });
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    return res.status(200).json({ success: true, message: 'Notification deleted successfully' });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to delete notification' });
  }
};

// Fetch notifications relevant to the authenticated student
export const getStudentNotifications = async (req, res) => {
  try {
    const studentId = req.student._id;

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
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

// Mark a specific notification as read by the authenticated student
export const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const studentId = req.student._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid notification ID' });
    }

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
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to mark notification as read' });
  }
};

// Mark all notifications as read for the authenticated student
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
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to mark notifications as read' });
  }
};

// Retrieve public announcements
export const getPublicAnnouncements = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      announcements: [],
    });
  } catch {
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
