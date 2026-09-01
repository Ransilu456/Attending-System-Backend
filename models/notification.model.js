import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Notification title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters'],
  },
  message: {
    type: String,
    required: [true, 'Notification message is required'],
    trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters'],
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high'],
    default: 'normal',
  },
  type: {
    type: String,
    enum: ['announcement', 'reminder', 'alert', 'info'],
    default: 'announcement',
  },
  // Empty array = broadcast to all students
  targetStudents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
  }],
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
  },
  // Track per-student read status
  readBy: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
    },
    readAt: {
      type: Date,
      default: Date.now,
    },
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Indexes for efficient queries
notificationSchema.index({ isActive: 1, createdAt: -1 });
notificationSchema.index({ targetStudents: 1 });
notificationSchema.index({ 'readBy.student': 1 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
