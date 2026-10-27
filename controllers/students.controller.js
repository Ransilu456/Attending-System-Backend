import Student from '../models/student.model.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { maskId, resolveId } from '../utils/idMask.js';
import { getSystemSessionDates, calculateStudentAttendanceStats } from '../utils/attendanceStats.js';
import { isMongoUnavailable } from '../utils/dbAvailability.js';
import { getFirebaseAdmin } from '../config/firebase.js';
import { readStudentDocument } from '../services/firebaseQuotaService.js';
import StudentSession from '../models/studentSession.model.js';
import { mirrorStudentAfterWrite } from '../services/firebaseMirrorService.js';
import {
  clearStudentSessionCookie,
  createStudentSessionToken,
  hashStudentSessionToken,
  readStudentSessionToken,
  setStudentSessionCookie,
  STUDENT_SESSION_MAX_AGE_MS,
} from '../utils/studentSession.js';
dotenv.config();

const studentDataForFallback = async (studentId, { forceRefresh = false } = {}) => {
  if (mongoose.connection.readyState === 1) {
    try {
      const student = await Student.findById(studentId)
        .select('-messages')
        .lean();
      if (student) return student;
    } catch (error) {
      if (!isMongoUnavailable(error)) throw error;
    }
  }

  if (!getFirebaseAdmin()) {
    const error = new Error('Student information is temporarily unavailable. Please try again later.');
    error.code = 'STUDENT_DATA_UNAVAILABLE';
    throw error;
  }
  const student = await readStudentDocument(studentId, { forceRefresh });
  if (!student) {
    const error = new Error('Your student record is unavailable. Please contact your teacher.');
    error.code = 'STUDENT_RECORD_NOT_FOUND';
    throw error;
  }
  return student;
};

const sendStudentFallbackError = (res, error) => {
  if (error.code === 'FIREBASE_DAILY_LIMIT') {
    return res.status(429).json({
      success: false,
      message: 'Student information is temporarily unavailable. Please try again later.',
    });
  }
  if (error.code === 'STUDENT_DATA_UNAVAILABLE') {
    return res.status(503).json({ success: false, message: error.message });
  }
  if (error.code === 'STUDENT_RECORD_NOT_FOUND') {
    return res.status(404).json({ success: false, message: error.message });
  }
  if (isMongoUnavailable(error) || error.code === 8 || error.code === 'resource-exhausted') {
    return res.status(503).json({
      success: false,
      message: 'Student data is temporarily unavailable. Please try again later or contact your teacher.',
    });
  }
  return res.status(500).json({
    success: false,
    message: 'Could not load student data. Please try again later.',
  });
};

function safeError(err) {
  return process.env.NODE_ENV === 'development' ? err.message : 'An error occurred';
}

// Download student QR code PNG image file attachment
export const downloadQRCode = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ success: false, message: 'The service is temporarily unavailable. Please try again later.' });
    }

    const { indexNumber, name, studentId } = req.query;
    let student;
    const resolvedStudentId = resolveId(studentId);
    
    if (resolvedStudentId && mongoose.Types.ObjectId.isValid(resolvedStudentId)) {
      student = await Student.findById(resolvedStudentId);
    } else if (indexNumber && name) {
      student = await Student.findOne({ 
        indexNumber: String(indexNumber).trim().toUpperCase(), 
        name: String(name).trim() 
      });
    } else {
      return res.status(400).json({ message: 'Either valid studentId OR both indexNumber and name are required' });
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
    if (isMongoUnavailable(error)) {
      return res.status(503).json({ success: false, message: 'The service is temporarily unavailable. Please try again later.' });
    }
    res.status(500).json({ message: 'Error downloading QR code', error: error.message });
  }
};

// Search student and return their QR code payload
export const searchQRCode = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ success: false, message: 'The service is temporarily unavailable. Please try again later.' });
    }

    const { name, indexNumber } = req.query;

    if (!name && !indexNumber) {
      return res.status(400).json({ message: 'Either name or indexNumber is required' });
    }

    const query = {};
    if (indexNumber) query.indexNumber = String(indexNumber).trim().toUpperCase();
    if (name) query.name = String(name).trim();

    const student = await Student.findOne(query);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!student.qrCode) {
      return res.status(404).json({ message: 'QR Code not found for this student' });
    }
    
    res.status(200).json({ qrCode: student.qrCode });
  } catch (error) {
    if (isMongoUnavailable(error)) {
      return res.status(503).json({ success: false, message: 'The service is temporarily unavailable. Please try again later.' });
    }
    res.status(500).json({ message: 'Error searching for student', error: error.message });
  }
};

// Fetch student profile details by ID
export const getStudentProfile = async (req, res) => {
  try {
    const studentId = resolveId(req.params.studentId || req.query.studentId);

    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ message: 'Valid student ID is required.' });
    }

    const student = await Student.findById(studentId)
      .select('-qrCode -qrToken -messages')
      .lean();

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.status(200).json({
      message: 'Student profile retrieved successfully',
      student: { ...student, _id: maskId(student._id), id: maskId(student._id) }
    });
  } catch {
    res.status(500).json({ message: 'Error fetching student profile' });
  }
};

// Update student profile details (admin access)
export const updateStudentProfile = async (req, res) => {
  try {
    const studentId = resolveId(req.params.studentId || req.query.studentId);

    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ message: 'Valid student ID is required.' });
    }

    // Whitelist only safe updatable fields
    const ALLOWED = ['name', 'address', 'student_email', 'parent_email', 'parent_telephone', 'dateOfBirth', 'profileImage', 'status'];
    const updates = {};
    for (const field of ALLOWED) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    const student = await Student.findByIdAndUpdate(
      studentId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-qrCode -qrToken -messages');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const firebaseSynced = await mirrorStudentAfterWrite(student._id, 'admin profile update');

    res.status(200).json({
      message: 'Student profile updated successfully',
      student: { ...student.toObject(), _id: maskId(student._id), id: maskId(student._id) },
      firebaseSynced,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    res.status(500).json({ message: 'Error updating student profile' });
  }
};

// Retrieve student attendance history filtered by date
export const getAttendanceHistory = async (req, res) => {
  try {
    const studentId = resolveId(req.params.studentId || req.query.studentId);

    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ message: 'Valid student ID is required.' });
    }

    const { startDate, endDate } = req.query;

    const student = await Student.findById(studentId)
      .select('name indexNumber attendanceHistory');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    let history = [...student.attendanceHistory];
    if (startDate) history = history.filter(r => new Date(r.date) >= new Date(startDate));
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      history = history.filter(r => new Date(r.date) <= end);
    }
    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json({
      message: 'Attendance history retrieved successfully',
      student: {
        name: student.name,
        indexNumber: student.indexNumber,
        attendanceHistory: history
      }
    });
  } catch {
    res.status(500).json({ message: 'Error fetching attendance history' });
  }
};

// Compute high-level dashboard metrics and attendance trends
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
    
    const studentsAbsent = Math.max(0, totalStudents - studentsPresent);
    
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
    res.status(500).json({ 
      success: false, 
      message: 'Error retrieving dashboard statistics', 
      error: error.message 
    });
  }
};

export const createStudentSession = async (req, res) => {
  const idToken = req.body?.idToken;
  if (typeof idToken !== 'string' || !idToken || idToken.length > 5000) {
    return res.status(400).json({
      success: false,
      message: 'A valid student sign-in is required.',
    });
  }

  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: 'Student session service is temporarily unavailable. Please try again later.',
    });
  }

  try {
    const firebase = getFirebaseAdmin();
    if (!firebase) {
      return res.status(503).json({
        success: false,
        message: 'Student sign-in is not configured. Please contact your teacher.',
      });
    }
    const decoded = await firebase.auth.verifyIdToken(idToken, true);
    if (decoded.role !== 'student' || !mongoose.Types.ObjectId.isValid(decoded.uid)) {
      return res.status(401).json({ success: false, message: 'Student sign-in could not be verified.' });
    }

    const [student, firebaseUser] = await Promise.all([
      Student.findById(decoded.uid).select('_id student_email status'),
      firebase.auth.getUser(decoded.uid),
    ]);
    if (
      !student ||
      student.status !== 'active' ||
      firebaseUser.disabled ||
      String(firebaseUser.email || '').trim().toLowerCase() !== student.student_email
    ) {
      return res.status(401).json({ success: false, message: 'Student sign-in could not be verified.' });
    }

    const token = createStudentSessionToken();
    const expiresAt = new Date(Date.now() + STUDENT_SESSION_MAX_AGE_MS);
    await StudentSession.create({
      studentId: student._id,
      tokenHash: hashStudentSessionToken(token),
      expiresAt,
    });
    setStudentSessionCookie(res, token);
    return res.status(200).json({ success: true, message: 'Student session created.' });
  } catch (error) {
    if (isMongoUnavailable(error)) {
      return res.status(503).json({
        success: false,
        message: 'Student session service is temporarily unavailable. Please try again later.',
      });
    }
    return res.status(401).json({ success: false, message: 'Student sign-in could not be verified.' });
  }
};

export const restoreStudentSession = async (req, res) => {
  try {
    const firebase = getFirebaseAdmin();
    if (!firebase) {
      return res.status(503).json({
        success: false,
        message: 'Student session restoration is not configured.',
      });
    }

    const customToken = await firebase.auth.createCustomToken(
      String(req.student._id),
      { role: 'student' },
    );
    return res.status(200).json({ success: true, customToken });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Could not restore the student session. Please sign in again.',
    });
  }
};

export const logoutStudent = async (req, res) => {
  const token = readStudentSessionToken(req);
  clearStudentSessionCookie(res);

  if (!token) return res.status(200).json({ success: true });

  try {
    await StudentSession.updateOne(
      { tokenHash: hashStudentSessionToken(token), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    if (isMongoUnavailable(error)) {
      return res.status(503).json({
        success: false,
        message: 'Could not complete sign-out. Please try again later.',
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Could not revoke the student session.',
    });
  }
};

// Retrieve authenticated student's own profile
export const getMyProfile = async (req, res) => {
  try {
    const student = await Student.findById(req.student._id)
      .select('-qrCode -qrToken -messages')
      .lean();

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.status(200).json({
      message: 'Profile retrieved successfully',
      student: { ...student, _id: maskId(student._id), id: maskId(student._id) }
    });
  } catch (error) {
    if (isMongoUnavailable(error)) {
      return res.status(503).json({
        success: false,
        message: 'The service is temporarily unavailable. Please try again later.'
      });
    }
    res.status(500).json({ message: 'Error fetching student profile' });
  }
};

// Update authenticated student's own profile (strictly whitelisted fields)
export const updateMyProfile = async (req, res) => {
  try {
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

    const firebaseSynced = await mirrorStudentAfterWrite(student._id, 'student profile update');

    res.status(200).json({
      message: 'Profile updated successfully',
      student: { ...student.toObject(), _id: maskId(student._id), id: maskId(student._id) },
      firebaseSynced,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    if (isMongoUnavailable(error)) {
      return res.status(503).json({ success: false, message: 'The service is temporarily unavailable. Please try again later.' });
    }
    res.status(500).json({ message: 'Error updating profile', error: error.message });
  }
};

// Retrieve authenticated student's own attendance history
export const getMyAttendance = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const student = await Student.findById(req.student._id)
      .select('name indexNumber attendanceHistory attendancePercentage attendanceCount lastAttendance status createdAt');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const allSessionDates = await getSystemSessionDates();
    const stats = calculateStudentAttendanceStats(student, allSessionDates, startDate, endDate);

    let history = [...(student.attendanceHistory || [])];

    if (startDate) {
      const start = new Date(startDate);
      history = history.filter(r => new Date(r.date) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      history = history.filter(r => new Date(r.date) <= end);
    }

    history.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json({
      message: 'Attendance retrieved successfully',
      student: {
        name: student.name,
        indexNumber: student.indexNumber,
        lastAttendance: student.lastAttendance,
        status: student.status,
      },
      attendanceHistory: history,
      stats: {
        ...stats,
        totalCount: history.length,
      }
    });
  } catch (error) {
    if (isMongoUnavailable(error)) {
      return res.status(503).json({ success: false, message: 'The service is temporarily unavailable. Please try again later.' });
    }
    res.status(500).json({ message: 'Error fetching attendance', error: error.message });
  }
};

const normalizeStudentResponse = (value) => {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value && typeof value.toHexString === 'function') return value.toHexString();
  if (Array.isArray(value)) return value.map(normalizeStudentResponse);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'messages' && key !== '__v')
        .map(([key, child]) => [key, normalizeStudentResponse(child)])
    );
  }
  return value;
};

const requireActiveStudent = (student) => {
  if (student.status !== 'active') {
    const error = new Error('Your account is not active. Please contact your teacher.');
    error.code = 'STUDENT_INACTIVE';
    throw error;
  }
};

export const getFirebaseFallbackProfile = async (req, res) => {
  try {
    const student = await studentDataForFallback(req.firebaseStudent.uid);
    requireActiveStudent(student);
    const profile = normalizeStudentResponse(student);
    delete profile.attendanceHistory;
    delete profile.qrCode;
    delete profile.qrToken;
    const studentId = String(student._id || req.firebaseStudent.uid);
    res.status(200).json({
      message: 'Student profile retrieved successfully.',
      student: { ...profile, _id: studentId, id: studentId },
    });
  } catch (error) {
    if (error.code === 'STUDENT_INACTIVE') {
      return res.status(403).json({ success: false, message: error.message });
    }
    return sendStudentFallbackError(res, error);
  }
};

export const getFirebaseFallbackAttendance = async (req, res) => {
  try {
    const student = await studentDataForFallback(req.firebaseStudent.uid, {
      forceRefresh: req.query.forceRefresh === 'true',
    });
    requireActiveStudent(student);

    let attendanceHistory = [...(student.attendanceHistory || [])];
    if (req.query.startDate) {
      const start = new Date(req.query.startDate);
      attendanceHistory = attendanceHistory.filter((record) => new Date(record.date) >= start);
    }
    if (req.query.endDate) {
      const end = new Date(req.query.endDate);
      end.setHours(23, 59, 59, 999);
      attendanceHistory = attendanceHistory.filter((record) => new Date(record.date) <= end);
    }
    attendanceHistory.sort((left, right) => new Date(right.date) - new Date(left.date));

    const historyForStats = attendanceHistory.filter((record) =>
      ['present', 'entered', 'left'].includes(record.status)
    );
    const presentCount = mongoose.connection.readyState === 1
      ? new Set(historyForStats.map((record) => new Date(record.date).toISOString().slice(0, 10))).size
      : Number(student.attendanceCount) || new Set(
        historyForStats.map((record) => new Date(record.date).toISOString().slice(0, 10))
      ).size;
    const computedStats = mongoose.connection.readyState === 1
      ? calculateStudentAttendanceStats(
        student,
        await getSystemSessionDates(),
        req.query.startDate,
        req.query.endDate
      )
      : null;
    const expectedSessions = computedStats?.expectedSessions ??
      (student.attendanceExpectedSessions !== undefined
        ? Number(student.attendanceExpectedSessions)
        : attendanceHistory.length);
    const percentage = computedStats?.attendancePercentage ??
      (Number(student.attendancePercentage) || 0);

    res.status(200).json({
      message: 'Attendance retrieved successfully.',
      student: {
        name: student.name,
        indexNumber: student.indexNumber,
        lastAttendance: normalizeStudentResponse(student.lastAttendance),
        status: student.status,
      },
      attendanceHistory: normalizeStudentResponse(attendanceHistory),
      stats: {
        totalCount: attendanceHistory.length,
        presentCount,
        absentCount: attendanceHistory.filter((record) => record.status === 'absent').length,
        expectedSessions,
        attendancePercentage: percentage,
      },
    });
  } catch (error) {
    if (error.code === 'STUDENT_INACTIVE') {
      return res.status(403).json({ success: false, message: error.message });
    }
    return sendStudentFallbackError(res, error);
  }
};

export const getFirebaseFallbackQRCode = async (req, res) => {
  try {
    const student = await studentDataForFallback(req.firebaseStudent.uid);
    requireActiveStudent(student);
    if (!student.qrCode) {
      return res.status(404).json({ success: false, message: 'No QR code is available for your account.' });
    }
    return res.status(200).json({ qrCode: student.qrCode });
  } catch (error) {
    if (error.code === 'STUDENT_INACTIVE') {
      return res.status(403).json({ success: false, message: error.message });
    }
    return sendStudentFallbackError(res, error);
  }
};

export const verifyFirebaseStudentEnrollment = async (req, res) => {
  try {
    const { email, phoneNumber, studentId } = req.body;
    if (
      typeof email !== 'string' ||
      typeof phoneNumber !== 'string' ||
      typeof studentId !== 'string'
    ) {
      return res.status(400).json({ success: false, message: 'Enter your student email, registered phone, and student ID.' });
    }

    const student = await studentDataForFallback(req.firebaseStudent.uid);
    requireActiveStudent(student);
    const submittedEmail = email.trim().toLowerCase();
    const storedPhone = String(student.parent_telephone || '').replace(/\D/g, '');
    const submittedPhone = phoneNumber.replace(/\D/g, '');
    const requestedId = studentId.trim();
    const matchesId = String(student._id || req.firebaseStudent.uid).toLowerCase() === requestedId.toLowerCase() ||
      String(student.indexNumber || '').toUpperCase() === requestedId.toUpperCase();

    if (
      String(student.student_email || '').trim().toLowerCase() !== submittedEmail ||
      storedPhone !== submittedPhone ||
      !matchesId ||
      req.firebaseStudent.email?.toLowerCase() !== submittedEmail
    ) {
      return res.status(400).json({
        success: false,
        message: 'The details do not match an active student record.',
      });
    }
    return res.status(200).json({ success: true, email: submittedEmail });
  } catch (error) {
    if (error.code === 'STUDENT_INACTIVE') {
      return res.status(403).json({ success: false, message: error.message });
    }
    return sendStudentFallbackError(res, error);
  }
};
