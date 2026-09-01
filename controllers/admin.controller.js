import Admin from '../models/admin.model.js';
import Student from '../models/student.model.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { generateQRCode } from '../utils/qrGenerator.js';
import { mongoIdToNumericCode } from '../utils/idConverter.js';

dotenv.config();

// Register a new administrator account 
export const registerAdmin = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Please provide all required fields.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existingAdmin = await Admin.findOne({ email: normalizedEmail });
  if (existingAdmin) {
    return res.status(400).json({ message: 'Admin account already exists with this email.' });
  }

  // Security: Prevent unauthenticated privilege escalation to superadmin
  const newAdmin = new Admin({
    name: String(name).trim(),
    email: normalizedEmail,
    password,
    role: 'admin',
  });

  try {
    await newAdmin.save();
    res.status(201).json({ message: 'Admin registered successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Error registering admin.', error: error.message });
  }
};

// Authenticate administrator credentials and issue JWT
export const loginAdmin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Please provide both email and password.' });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const admin = await Admin.findOne({ email: normalizedEmail }).select('+password');
    if (!admin) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (!admin.isActive) {
      return res.status(401).json({ message: 'Account is inactive. Please contact support.' });
    }

    // Check if account is temporarily locked due to previous failed attempts
    if (admin.accountLockedUntil && admin.accountLockedUntil > Date.now()) {
      return res.status(401).json({ message: 'Account is temporarily locked. Please try again later.' });
    }

    const isMatch = await admin.matchPassword(password);
    if (!isMatch) {
      await admin.handleFailedLogin();
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'Server authentication configuration error.' });
    }

    const token = jwt.sign(
      { id: admin._id, role: admin.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: '8h' }
    );

    await admin.handleSuccessfulLogin();
    res.status(200).json({
      message: 'Login successful',
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Error logging in admin.', error: error.message });
  }
};

// Invalidate admin session acknowledgment
export const logoutAdmin = async (req, res) => {
  try {
    return res.status(200).json({
      status: 'success',
      message: 'Logged out successfully'
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'An error occurred during logout',
      error: error.message
    });
  }
};

// Retrieve authenticated admin user details
export const getAdminDetails = async (req, res) => {
  const adminId = req.admin?.id || req.admin?._id;

  try {
    const admin = await Admin.findById(adminId).select('-password');
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.status(200).json(admin);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching admin details.', error: error.message });
  }
};

// Query paginated and searchable students list
export const getStudents = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search ? String(req.query.search).trim() : '';

    let query = {};
    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { indexNumber: { $regex: search, $options: 'i' } },
          { student_email: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const students = await Student.find(query)
      .select('-attendanceHistory -messages')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

    const totalStudents = await Student.countDocuments(query);

    res.status(200).json({ 
      success: true,
      students,
      pagination: {
        total: totalStudents,
        page,
        limit,
        pages: Math.ceil(totalStudents / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching students', error: err.message });
  }
};

// Update an existing student record by ID
export const updateStudent = async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid student ID' });
  }

  try {
    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const updatedStudent = await Student.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      message: 'Student updated successfully',
      student: updatedStudent
    });
  } catch (err) {
    res.status(500).json({ message: 'Error updating student', error: err.message });
  }
};

// Permanently delete a student record by ID
export const deleteStudent = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid student ID' });
  }

  try {
    const student = await Student.findByIdAndDelete(id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.status(200).json({ message: 'Student deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting student', error: err.message });
  }
};

// Fetch all student records excluding heavy history arrays
export const getAllStudents = async (req, res) => {
  try {
    const students = await Student.find().select('-attendanceHistory -messages').lean();

    res.status(200).json({
      message: 'All students fetched successfully.',
      students,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching all students', error: error.message });
  }
};

// Register a new student and generate their unique QR code token
export const registerStudent = async (req, res) => {
  try {
    const { name, address, student_email, parent_email, parent_telephone, indexNumber, dateOfBirth } = req.body;

    if (!name || !address || !student_email || !parent_email || !parent_telephone || !indexNumber || !dateOfBirth) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const qrToken = crypto.randomBytes(16).toString('hex');

    const newStudent = new Student({
      name: String(name).trim(),
      address: String(address).trim(),
      student_email: String(student_email).toLowerCase().trim(),
      parent_email: String(parent_email).toLowerCase().trim(),
      parent_telephone: String(parent_telephone).trim(),
      indexNumber: String(indexNumber).toUpperCase().trim(),
      dateOfBirth,
      qrToken
    });

    const savedStudent = await newStudent.save();
    const qrCode = await generateQRCode(savedStudent.qrToken);
    savedStudent.qrCode = qrCode;
    await savedStudent.save();

    res.status(201).json({
      message: 'Student registered successfully',
      student: {
        name: savedStudent.name,
        indexNumber: savedStudent.indexNumber,
        email: savedStudent.student_email,
        dateOfBirth: savedStudent.dateOfBirth,
        _id: savedStudent._id
      },
      qrCode
    });
  } catch (error) {
    res.status(500).json({ message: 'Error registering student', error: error.message });
  }
};

// Handle admin forgot password request and create reset token
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'Email is required'
      });
    }

    const admin = await Admin.findOne({ email: String(email).toLowerCase().trim() });

    if (!admin) {
      return res.status(200).json({
        status: 'success',
        message: 'If an account with that email exists, a password reset link has been processed.'
      });
    }

    const resetToken = admin.createPasswordResetToken();
    await admin.save();

    const resetURL = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;

    res.status(200).json({
      status: 'success',
      message: 'If an account with that email exists, a password reset link has been processed.',
      ...(process.env.NODE_ENV === 'development' && { resetURL })
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error processing forgot password request.',
      error: error.message
    });
  }
};

// Reset administrator password using a valid reset token
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Reset token and new password are required'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 8 characters long'
      });
    }

    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const admin = await Admin.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!admin) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired reset token'
      });
    }

    admin.password = password;
    admin.passwordResetToken = undefined;
    admin.passwordResetExpires = undefined;
    admin.failedLoginAttempts = 0;
    admin.accountLockedUntil = undefined;
    await admin.save();

    res.status(200).json({
      status: 'success',
      message: 'Password reset successful. You can now log in with your new password.'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error resetting password.',
      error: error.message
    });
  }
};

// Update current admin password when logged in
export const updatePassword = async (req, res) => {
  try {
    if (!req.admin || !req.admin._id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { currentPassword, newPassword } = req.body;
    const admin = await Admin.findById(req.admin._id).select('+password');

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    const isMatch = await admin.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    admin.password = newPassword;
    await admin.save();

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating password', error: error.message });
  }
};

// Update current admin profile name and email
export const updateProfile = async (req, res) => {
  try {
    if (!req.admin || !req.admin._id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { name, email } = req.body;
    const admin = await Admin.findById(req.admin._id);

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    const originalEmail = admin.email;
    admin.name = name ? String(name).trim() : admin.name;

    if (email && email !== originalEmail) {
      const normalizedEmail = String(email).trim().toLowerCase();
      const existingAdmin = await Admin.findOne({ email: normalizedEmail, _id: { $ne: admin._id } });
      if (existingAdmin) {
        return res.status(400).json({ message: 'Email already in use by another account' });
      }
      admin.email = normalizedEmail;
    }

    await admin.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating profile', error: error.message });
  }
};

// Generate student QR code image by student ID
export const generateStudentQRCode = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid student ID' });
    }

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    let codeToEncode = student.qrToken || mongoIdToNumericCode(student._id.toString());
    const qrCode = await generateQRCode(codeToEncode);

    const base64Data = qrCode.replace(/^data:image\/png;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `inline; filename="${student.indexNumber}-${student.name}.png"`);
    return res.send(imageBuffer);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to generate QR code', error: error.message });
  }
};

// Generate student QR code image by index number
export const getStudentQRByIndex = async (req, res) => {
  try {
    const { indexNumber } = req.params;
    if (!indexNumber) {
      return res.status(400).json({ success: false, message: 'Index number is required' });
    }

    const student = await Student.findOne({ indexNumber: String(indexNumber).trim().toUpperCase() });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found with the provided index number'
      });
    }

    let codeToEncode = student.qrToken || mongoIdToNumericCode(student._id.toString());
    const qrCode = await generateQRCode(codeToEncode);

    const base64Data = qrCode.replace(/^data:image\/png;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `inline; filename="${student.indexNumber}-${student.name}.png"`);
    return res.send(imageBuffer);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to get QR code',
      error: error.message
    });
  }
};

// Fetch recent attendance logs for today
export const getRecentAttendance = async (req, res) => {
  try {
    const now = DateTime.now().setZone('Asia/Colombo');
    const startOfDay = now.startOf('day').toJSDate();
    const endOfDay = now.endOf('day').toJSDate();

    const students = await Student.aggregate([
      {
        $match: {
          'attendanceHistory.date': { $gte: startOfDay, $lte: endOfDay }
        }
      },
      {
        $project: {
          name: 1,
          indexNumber: 1,
          student_email: 1,
          status: 1,
          todayAttendance: {
            $filter: {
              input: '$attendanceHistory',
              as: 'record',
              cond: {
                $and: [
                  { $gte: ['$$record.date', startOfDay] },
                  { $lte: ['$$record.date', endOfDay] }
                ]
              }
            }
          },
          lastMessage: { $slice: ['$messages', -1] }
        }
      }
    ]);

    const processedRecords = students.map(student => {
      const todayRecords = student.todayAttendance || [];
      
      const latestRecord = todayRecords.length > 0
        ? todayRecords.reduce((latest, current) => {
          return new Date(current.date) > new Date(latest.date) ? current : latest;
        })
        : null;

      return {
        _id: student._id,
        name: student.name,
        indexNumber: student.indexNumber,
        email: student.student_email,
        status: latestRecord?.status || 'absent',
        entryTime: latestRecord?.entryTime || null,
        leaveTime: latestRecord?.leaveTime || null,
        timestamp: latestRecord?.date || null,
        messageStatus: student.lastMessage?.[0]?.status || null
      };
    });

    const sortedRecords = processedRecords.sort((a, b) => {
      const timeA = a.timestamp || new Date(0);
      const timeB = b.timestamp || new Date(0);
      return new Date(timeB) - new Date(timeA);
    });

    const stats = {
      totalCount: processedRecords.length,
      presentCount: processedRecords.filter(r => r.status === 'entered' || r.status === 'present').length,
      absentCount: processedRecords.filter(r => r.status === 'absent').length,
      leftCount: processedRecords.filter(r => r.status === 'left').length
    };

    res.status(200).json({
      status: 'success',
      message: 'Recent attendance records retrieved successfully',
      students: sortedRecords,
      stats,
      timestamp: now.toJSDate()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve recent attendance records',
      error: error.message
    });
  }
};

export default {
  registerAdmin,
  loginAdmin,
  logoutAdmin,
  getAdminDetails,
  getStudents,
  updateStudent,
  deleteStudent,
  getAllStudents,
  registerStudent,
  forgotPassword,
  resetPassword,
  updatePassword,
  updateProfile,
  generateStudentQRCode,
  getStudentQRByIndex,
  getRecentAttendance
};