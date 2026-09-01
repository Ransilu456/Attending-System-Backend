import Student from '../models/student.model.js';
import { DateTime } from 'luxon';

// Generate WhatsApp attendance notification deep link for student check-in/out
export const sendAttendanceNotificationLink = async (studentId, status, timestamp) => {
  try {
    const student = await Student.findById(studentId);

    if (!student) {
      return {
        success: false,
        error: 'Student not found',
        code: 'STUDENT_NOT_FOUND'
      };
    }

    if (!student.parent_telephone) {
      return {
        success: false,
        error: 'No parent phone number',
        code: 'NO_PHONE'
      };
    }

    // Normalize phone number to international format
    let phoneNumber = student.parent_telephone.toString().replace(/\D/g, '');

    if (phoneNumber.startsWith('0')) {
      phoneNumber = '94' + phoneNumber.slice(1);
    }

    if (phoneNumber.startsWith('+')) {
      phoneNumber = phoneNumber.substring(1);
    }

    if (phoneNumber.length < 10) {
      return {
        success: false,
        error: 'Invalid phone number',
        code: 'INVALID_PHONE'
      };
    }

    const displayStatus = status === 'entered' ? 'Entered School' : status === 'left' ? 'Left School' : status;
    const scanTime = DateTime.fromJSDate(timestamp).toLocaleString(DateTime.DATETIME_SHORT);

    const messageText = [
      '*Attendance Update*',
      '',
      `Student: *${student.name || 'N/A'}*`,
      `Index Number: *${student.indexNumber || 'N/A'}*`,
      `Status: *${displayStatus}*`,
      `Time: *${scanTime}*`,
      '',
      'Additional Details:',
      `Email: ${student.student_email || 'N/A'}`,
      `Parent Phone: ${student.parent_telephone || 'N/A'}`,
      `Address: ${student.address || 'N/A'}`
    ].join('\n');

    const encodedText = encodeURIComponent(messageText);
    const whatsappURL = `https://wa.me/${phoneNumber}?text=${encodedText}`;

    const studentData = {
      name: student.name,
      indexNumber: student.indexNumber,
      student_email: student.student_email,
      parentPhone: student.parent_telephone,
      address: student.address,
      status: displayStatus,
      timestamp: scanTime
    };

    return {
      success: true,
      whatsappURL,
      student: studentData
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: 'LINK_GENERATION_ERROR'
    };
  }
};

export default {
  sendAttendanceNotificationLink
};