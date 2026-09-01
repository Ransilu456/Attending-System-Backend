import Student from '../models/student.model.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

export const downloadQRCode = async (req, res) => {
  try {
    const { indexNumber, name, studentId } = req.query;

    let student;
    
    if (studentId) {
      student = await Student.findById(studentId);
    } else if (indexNumber && name) {
      student = await Student.findOne({ indexNumber, name });
    } else {
      return res.status(400).json({ message: 'Either studentId OR both indexNumber and name are required' });
    }

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!student.qrCode) {
      return res.status(404).json({ message: 'QR code not found for this student' });
    }

    const qrCodeBuffer = Buffer.from(student.qrCode.split(',')[1], 'base64');

    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `attachment; filename=${student.indexNumber}_qr_code.png`);

    return res.send(qrCodeBuffer);
  } catch (error) {
    console.error('Error downloading QR code:', error);
    res.status(500).json({ message: 'Error downloading QR code', error });
  }
};

export const searchQRCode = async (req, res) => {
  try {
    const { name, indexNumber } = req.query;

    if (!name && !indexNumber) {
      return res.status(400).json({ message: 'Either name or indexNumber is required' });
    }

    const student = await Student.findOne({
      $or: [{ name }, { indexNumber }]
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!student.qrCode) {
      return res.status(404).json({ message: 'QR Code not found for this student' });
    }
   res.status(200).json({ qrCode: student.qrCode });
  } catch (error) {
    console.error('Error searching for student:', error);
    res.status(500).json({ message: 'Error searching for student', error });
  }
};

export const getStudentProfile = async (req, res) => {
  try {
    const studentId = req.params.studentId || req.query.studentId;
    
    if (!studentId) {
      return res.status(400).json({ 
        message: 'Student ID is required. Please provide it as a URL parameter or query parameter.' 
      });
    }
    
    const student = await Student.findById(studentId).select('-qrCode');
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.status(200).json({
      message: 'Student profile retrieved successfully',
      student
    });
  } catch (error) {
    console.error('Error fetching student profile:', error);
    res.status(500).json({ message: 'Error fetching student profile', error });
  }
};

export const updateStudentProfile = async (req, res) => {
  try {
    const studentId = req.params.studentId || req.query.studentId;
    
    if (!studentId) {
      return res.status(400).json({ 
        message: 'Student ID is required. Please provide it as a URL parameter or query parameter.' 
      });
    }
    
    const updates = req.body;

    const student = await Student.findByIdAndUpdate(
      studentId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-qrCode');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.status(200).json({
      message: 'Student profile updated successfully',
      student
    });
  } catch (error) {
    console.error('Error updating student profile:', error);
    res.status(500).json({ message: 'Error updating student profile', error });
  }
};

export const getAttendanceHistory = async (req, res) => {
  try {
    const studentId = req.params.studentId || req.query.studentId;
    
    if (!studentId) {
      return res.status(400).json({ 
        message: 'Student ID is required. Please provide it as a URL parameter or query parameter.' 
      });
    }
    
    const { startDate, endDate } = req.query;

    const query = { _id: studentId };
    if (startDate && endDate) {
      query['attendanceHistory.date'] = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const student = await Student.findOne(query)
      .select('name indexNumber attendanceHistory')
      .sort({ 'attendanceHistory.date': -1 });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.status(200).json({
      message: 'Attendance history retrieved successfully',
      student: {
        name: student.name,
        indexNumber: student.indexNumber,
        attendanceHistory: student.attendanceHistory
      }
    });
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    res.status(500).json({ message: 'Error fetching attendance history', error });
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date();
    start.setHours(0, 0, 0, 0); 
    
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999); 
    
    const totalStudents = await Student.countDocuments({ status: 'active' });
    
    const studentsPresent = await Student.countDocuments({
      'attendanceHistory.entryTime': { $gte: start, $lte: end },
      status: 'active'
    });
    
    const studentsAbsent = totalStudents - studentsPresent;
    
    const studentsInSchool = await Student.countDocuments({
      'attendanceHistory.entryTime': { $gte: start, $lte: end },
      'attendanceHistory.leaveTime': null,
      status: 'active'
    });
    
    const studentsLeft = await Student.countDocuments({
      'attendanceHistory.entryTime': { $gte: start, $lte: end },
      'attendanceHistory.leaveTime': { $ne: null },
      status: 'active'
    });
    
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      day.setHours(0, 0, 0, 0);
      
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      
      const count = await Student.countDocuments({
        'attendanceHistory.date': { $gte: day, $lt: nextDay },
        status: 'active'
      });
      
      last7Days.push({
        date: day.toISOString().split('T')[0],
        count
      });
    }
    
    const attendanceRate = totalStudents > 0 
      ? Math.round((studentsPresent / totalStudents) * 100) 
      : 0;
    
    const topAttenders = await Student.find({ status: 'active' })
      .select('name indexNumber attendanceCount attendancePercentage')
      .sort({ attendanceCount: -1, attendancePercentage: -1 })
      .limit(5);
    
    res.status(200).json({
      success: true,
      timestamp: new Date(),
      metrics: {
        totalStudents,
        studentsPresent,
        studentsAbsent,
        studentsInSchool,
        studentsLeft,
        attendanceRate
      },
      trends: {
        last7Days
      },
      topAttenders: topAttenders.map(student => ({
        name: student.name,
        indexNumber: student.indexNumber,
        attendanceCount: student.attendanceCount,
        attendancePercentage: student.attendancePercentage
      }))
    });
    
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error retrieving dashboard statistics', 
      error: error.message 
    });
  }
};

// ─── Student Login (email + indexNumber) ─────────────────────
export const studentLogin = async (req, res) => {
  try {
    const { student_email, indexNumber } = req.body;

    if (!student_email || !indexNumber) {
      return res.status(400).json({ message: 'Email and index number are required.' });
    }

    const student = await Student.findOne({
      student_email: student_email.toLowerCase().trim(),
      indexNumber: indexNumber.toUpperCase().trim()
    });

    if (!student) {
      return res.status(401).json({ message: 'No student found with this email and index number combination.' });
    }

    if (student.status !== 'active') {
      return res.status(401).json({ message: 'Your account is not active. Please contact support.' });
    }

    const token = jwt.sign(
      { id: student._id, role: 'student', indexNumber: student.indexNumber },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const effectivePresent = student.attendanceHistory.filter(
      r => r.status === 'present' || r.status === 'entered' || r.status === 'left'
    ).length;
    const attendancePercentage = student.attendanceHistory.length > 0
      ? (effectivePresent / student.attendanceHistory.length) * 100
      : 0;

    res.status(200).json({
      message: 'Login successful',
      token,
      student: {
        _id: student._id,
        name: student.name,
        indexNumber: student.indexNumber,
        student_email: student.student_email,
        address: student.address,
        attendancePercentage,
        attendanceCount: student.attendanceCount,
        status: student.status,
        lastAttendance: student.lastAttendance,
        profileImage: student.profileImage,
      }
    });
  } catch (error) {
    console.error('Student login error:', error);
    res.status(500).json({ message: 'Error during login', error: error.message });
  }
};

// ─── Get My Profile (requires student JWT via verifyStudent middleware) ──────
export const getMyProfile = async (req, res) => {
  try {
    const student = await Student.findById(req.student._id).select('-qrCode');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.status(200).json({
      message: 'Profile retrieved successfully',
      student
    });
  } catch (error) {
    console.error('Error fetching student profile:', error);
    res.status(500).json({ message: 'Error fetching student profile', error: error.message });
  }
};

// ─── Update My Profile (protected, whitelisted fields only) ──────────────────
export const updateMyProfile = async (req, res) => {
  try {
    // Strict whitelist — students may only touch these fields
    const ALLOWED_FIELDS = [
      'name', 'student_email', 'address',
      'parent_email', 'parent_telephone', 'dateOfBirth', 'profileImage',
    ];

    const updates = {};
    for (const field of ALLOWED_FIELDS) {
      if (req.body[field] !== undefined) {
        if (field === 'dateOfBirth' && !req.body[field]) {
          updates[field] = null;
        } else {
          updates[field] = req.body[field];
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided for update.' });
    }

    const student = await Student.findByIdAndUpdate(
      req.student._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-qrCode -qrToken -attendanceHistory -messages');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.status(200).json({
      message: 'Profile updated successfully',
      student,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    console.error('Error updating student profile:', error);
    res.status(500).json({ message: 'Error updating profile', error: error.message });
  }
};

// ─── Get My Attendance (protected, returns full attendance history) ───────────
export const getMyAttendance = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const student = await Student.findById(req.student._id)
      .select('name indexNumber attendanceHistory attendancePercentage attendanceCount lastAttendance status');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    let history = [...student.attendanceHistory];

    if (startDate) {
      const start = new Date(startDate);
      history = history.filter(r => new Date(r.date) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      history = history.filter(r => new Date(r.date) <= end);
    }

    // Sort descending by date
    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    const stats = {
      totalCount: student.attendanceHistory.length,
      presentCount: student.attendanceHistory.filter(r => r.status === 'present' || r.status === 'entered').length,
      absentCount: student.attendanceHistory.filter(r => r.status === 'absent').length,
      leftCount: student.attendanceHistory.filter(r => r.status === 'left').length,
      attendancePercentage: 0,
    };

    const effectivePresent = stats.presentCount + stats.leftCount;
    stats.attendancePercentage = stats.totalCount > 0
      ? (effectivePresent / stats.totalCount) * 100
      : 0;

    res.status(200).json({
      message: 'Attendance retrieved successfully',
      student: {
        name: student.name,
        indexNumber: student.indexNumber,
        lastAttendance: student.lastAttendance,
        status: student.status,
      },
      attendanceHistory: history,
      stats
    });
  } catch (error) {
    console.error('Error fetching student attendance:', error);
    res.status(500).json({ message: 'Error fetching attendance', error: error.message });
  }
};
