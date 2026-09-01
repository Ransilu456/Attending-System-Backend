import mongoose from 'mongoose';

// Notification document schema
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
  // Targeted students array (empty means broadcast to all)
  targetStudents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
  }],
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
  },
  // Read receipt list per student
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

// Database indexes for fast querying
notificationSchema.index({ isActive: 1, createdAt: -1 });
notificationSchema.index({ targetStudents: 1 });
notificationSchema.index({ 'readBy.student': 1 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
