import Student from '../models/student.model.js';
import { numericCodeToMongoId } from '../utils/idConverter.js';
import mongoose from 'mongoose';
import { sendAttendanceNotificationLink } from '../controllers/messaging.controller.js';

// Retrieve student QR code string or image by student ID
export const getStudentQRCode = async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid student ID is required'
      });
    }

    const student = await Student.findById(studentId).select('qrCodeData qrCode');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    const qrData = student.qrCodeData || student.qrCode;

    if (!qrData) {
      return res.status(404).json({
        success: false,
        message: 'QR code not found for this student',
        data: null
      });
    }

    return res.status(200).json({
      success: true,
      message: 'QR code data retrieved successfully',
      data: qrData
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve QR code data',
      error: error.message
    });
  }
};

// Store generated QR code string to a student document
export const saveQRCode = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { qrData } = req.body;

    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid student ID is required'
      });
    }

    if (!qrData) {
      return res.status(400).json({
        success: false,
        message: 'QR code data is required'
      });
    }

    const updateField = typeof qrData === 'string' && qrData.startsWith('data:image')
      ? { qrCode: qrData }
      : { qrCodeData: qrData };

    const student = await Student.findByIdAndUpdate(
      studentId,
      updateField,
      { new: true, runValidators: true }
    ).select('name indexNumber qrCodeData qrCode');

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'QR code data saved successfully',
      data: {
        _id: student._id,
        name: student.name,
        indexNumber: student.indexNumber,
        qrCodeUpdated: true
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to save QR code data',
      error: error.message
    });
  }
};

// Process QR code scan, identify student, and record attendance
export const markAttendanceQR = async (req, res) => {
  try {
    const { qrData } = req.body;

    if (!qrData) {
      return res.status(400).json({
        success: false,
        message: 'QR code data is required'
      });
    }

    let student = null;
    let studentId = null;
    let code = '';

    if (typeof qrData === 'string') {
      code = qrData.trim();
    } else if (qrData && typeof qrData === 'object') {
      code = (qrData.studentId || qrData._id || qrData.id || qrData.qrToken || qrData.indexNumber || '').toString().trim();
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Invalid QR code data structure'
      });
    }

    // Lookup student by 32-character secure token
    if (/^[0-9a-fA-F]{32}$/.test(code)) {
      student = await Student.findOne({ qrToken: code })
        .select('name indexNumber student_email parent_email parent_telephone address age status attendanceHistory messages lastAttendance attendancePercentage attendanceCount')
        .lean();
    }

    // Lookup student by 24-character hex MongoDB ObjectId
    if (!student && /^[0-9a-fA-F]{24}$/.test(code)) {
      student = await Student.findById(code)
        .select('name indexNumber student_email parent_email parent_telephone address age status attendanceHistory messages lastAttendance attendancePercentage attendanceCount')
        .lean();
    }

    // Lookup student by formatted 8-group numeric code
    if (!student && /^\d{4}(\s+\d{4}){7}$/.test(code)) {
      try {
        const idFromCode = numericCodeToMongoId(code);
        if (mongoose.Types.ObjectId.isValid(idFromCode)) {
          student = await Student.findById(idFromCode)
            .select('name indexNumber student_email parent_email parent_telephone address age status attendanceHistory messages lastAttendance attendancePercentage attendanceCount')
            .lean();
        }
      } catch {
        // Continue fallback search
      }
    }

    // Fallback lookup by sanitized alphanumeric indexNumber
    if (!student && /^[A-Za-z0-9_-]+$/.test(code)) {
      student = await Student.findOne({ indexNumber: code.toUpperCase() })
        .select('name indexNumber student_email parent_email parent_telephone address age status attendanceHistory messages lastAttendance attendancePercentage attendanceCount')
        .lean();
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
        details: 'No student found matching the provided QR code'
      });
    }

    studentId = student._id;

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayAttendance = student.attendanceHistory?.find(record =>
      new Date(record.date).toDateString() === today.toDateString()
    );

    let status = 'entered';
    if (todayAttendance) {
      if (todayAttendance.status === 'entered' || todayAttendance.status === 'present') {
        status = 'left';
      } else if (todayAttendance.status === 'left') {
        return res.status(400).json({
          success: false,
          message: 'Student has already checked in and out today'
        });
      }
    }

    const attendanceRecord = {
      date: now,
      status,
      entryTime: status === 'entered' ? now : todayAttendance?.entryTime,
      leaveTime: status === 'left' ? now : null,
      scanLocation: req.body.scanLocation || 'Main Entrance',
      deviceInfo: req.headers['user-agent'] || req.body.deviceInfo || 'Unknown'
    };

    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      {
        $set: { 
          lastAttendance: now,
          status: 'active'
        },
        $inc: {
          attendanceCount: (status === 'entered' && (!todayAttendance || todayAttendance.status === 'left')) ? 1 : 0
        },
        ...(todayAttendance
          ? {
            $set: {
              'attendanceHistory.$[elem].status': status,
              'attendanceHistory.$[elem].leaveTime': status === 'left' ? now : todayAttendance.leaveTime
            }
          }
          : {
            $push: {
              attendanceHistory: attendanceRecord
            }
          }
        )
      },
      {
        new: true,
        arrayFilters: todayAttendance ? [{ 'elem._id': todayAttendance._id }] : undefined
      }
    ).lean();

    if (!updatedStudent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to update student attendance'
      });
    }

    const notificationResult = await sendAttendanceNotificationLink(student._id, status, now);

    if (notificationResult.success && notificationResult.whatsappURL) {
      await Student.findByIdAndUpdate(studentId, {
        $push: {
          messages: {
            $each: [{
              type: 'whatsapp',
              url: notificationResult.whatsappURL,
              status,
              createdAt: now
            }],
            $slice: -5
          }
        }
      });
    }

    const finalStudent = await Student.findById(studentId)
      .select('name indexNumber student_email parent_email parent_telephone address age status attendanceCount attendancePercentage messages')
      .lean();

    return res.status(200).json({
      success: true,
      message: `Student verified and attendance marked successfully: ${student.name} has ${status}`,
      data: {
        student: {
          _id: student._id,
          name: student.name,
          indexNumber: student.indexNumber,
          student_email: student.student_email,
          parent_email: student.parent_email,
          parent_telephone: student.parent_telephone,
          address: student.address,
          age: student.age,
          status: updatedStudent.status || student.status,
          attendanceCount: updatedStudent.attendanceCount || student.attendanceCount || 0,
          attendancePercentage: updatedStudent.attendancePercentage || student.attendancePercentage || 0,
          messages: finalStudent?.messages || []
        },
        attendance: {
          current: attendanceRecord,
          today: todayAttendance ? {
            status,
            entryTime: todayAttendance.entryTime,
            leaveTime: status === 'left' ? now : todayAttendance.leaveTime,
            scanLocation: todayAttendance.scanLocation
          } : attendanceRecord,
          lastAttendance: now,
          attendancePercentage: updatedStudent.attendancePercentage || student.attendancePercentage || 0
        },
        whatsappURL: notificationResult.success ? notificationResult.whatsappURL : null
      }
    });
  } catch (error) {
    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid QR code format',
        details: 'The provided QR code data is not in the correct format'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Error processing QR code',
      error: error.message
    });
  }
};

export default {
  markAttendanceQR,
  getStudentQRCode,
  saveQRCode
};