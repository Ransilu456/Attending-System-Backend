import Student from '../models/student.model.js';
import { numericCodeToMongoId } from '../utils/idConverter.js';
import mongoose from 'mongoose';
import { sendAttendanceNotificationLink } from '../controllers/messaging.controller.js';

/**
 * @param {Object}
 * @param {Object}
 */
export const getStudentQRCode = async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Valid student ID is required'
      });
    }

    // Find the student's QR code in the database - check both fields
    const student = await Student.findById(studentId).select('qrCodeData qrCode');

    // If student doesn't exist
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Check if student has either qrCodeData or qrCode field
    const qrData = student.qrCodeData || student.qrCode;

    // If student doesn't have any QR code data
    if (!qrData) {
      return res.status(404).json({
        success: false,
        message: 'QR code not found for this student',
        data: null
      });
    }

    // Return the QR code data
    return res.status(200).json({
      success: true,
      message: 'QR code data retrieved successfully',
      data: qrData
    });
  } catch (error) {
    console.error('Error retrieving QR code data:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve QR code data',
      error: error.message
    });
  }
};

/**
 * @param {Object}
 * @param {Object}
 */
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

    // Determine which field to update based on the format of qrData
    const updateField = typeof qrData === 'string' && qrData.startsWith('data:image')
      ? { qrCode: qrData }
      : { qrCodeData: qrData };

    // Find the student and update their QR code data
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
    console.error('Error saving QR code data:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save QR code data',
      error: error.message
    });
  }
};

/**
 * @param {Object} req
 * @param {Object} res
 */
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

    // 1. Try secure token format (32-character hex)
    if (/^[0-9a-fA-F]{32}$/.test(code)) {
      console.log(`Searching student by secure token: ${code}`);
      student = await Student.findOne({ qrToken: code })
        .select('name indexNumber student_email parent_email parent_telephone address age status attendanceHistory messages lastAttendance attendancePercentage attendanceCount')
        .lean();
    }

    // 2. Try raw MongoDB ID format (24-character hex)
    if (!student && /^[0-9a-fA-F]{24}$/.test(code)) {
      console.log(`Searching student by raw ObjectId: ${code}`);
      student = await Student.findById(code)
        .select('name indexNumber student_email parent_email parent_telephone address age status attendanceHistory messages lastAttendance attendancePercentage attendanceCount')
        .lean();
    }

    // 3. Try space-separated numeric format converting to MongoId
    if (!student && /^\d{4}(\s+\d{4}){7}$/.test(code)) {
      try {
        const idFromCode = numericCodeToMongoId(code);
        if (mongoose.Types.ObjectId.isValid(idFromCode)) {
          console.log(`Searching student by numeric code converted to ID: ${idFromCode}`);
          student = await Student.findById(idFromCode)
            .select('name indexNumber student_email parent_email parent_telephone address age status attendanceHistory messages lastAttendance attendancePercentage attendanceCount')
            .lean();
        }
      } catch (err) {
        console.error('Failed to convert numeric code:', err);
      }
    }

    // 4. Fallback search by indexNumber
    if (!student) {
      console.log(`Searching student by index number fallback: ${code}`);
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
          status: 'active' // Automatically reactivate on scan
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

    const latestMessage = student.messages && student.messages.length > 0
      ? student.messages[student.messages.length - 1]
      : null;

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
          messages: finalStudent.messages || []
        },
        attendance: {
          current: attendanceRecord,
          today: todayAttendance ? {
            status: status,
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
    console.error('Error processing QR code:', error);

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
      details: 'An unexpected error occurred while processing the QR code',
      error: error.message
    });
  }
};


export default {
  markAttendanceQR,
  getStudentQRCode,
  saveQRCode
}; 