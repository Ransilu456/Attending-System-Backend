import Student from '../models/student.model.js';
import { DateTime } from 'luxon';

/**
 * Generate WhatsApp attendance notification link
 * @param {String} studentId
 * @param {String} status
 * @param {Date} timestamp
 */
export const sendAttendanceNotificationLink = async (studentId, status, timestamp) => {
  try {

    const student = await Student.findById(studentId);

    if (!student) {
      console.log(`Student not found with ID: ${studentId}`);
      return {
        success: false,
        error: 'Student not found',
        code: 'STUDENT_NOT_FOUND'
      };
    }

    if (!student.parent_telephone) {
      console.log(`No parent phone number for ${student.name}`);
      return {
        success: false,
        error: 'No parent phone number',
        code: 'NO_PHONE'
      };
    }

    /* -------------------------------
       PHONE NUMBER NORMALIZATION
    --------------------------------*/

    let phoneNumber = student.parent_telephone
      .toString()
      .replace(/\D/g, '');

    // Convert Sri Lankan local format
    if (phoneNumber.startsWith('0')) {
      phoneNumber = '94' + phoneNumber.slice(1);
    }

    // Remove leading +
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

    /* -------------------------------
       FORMAT STATUS TEXT
    --------------------------------*/

    const displayStatus =
      status === 'entered'
        ? 'Entered School'
        : status === 'left'
        ? 'Left School'
        : status;

    /* -------------------------------
       FORMAT TIME
    --------------------------------*/

    const scanTime = DateTime
      .fromJSDate(timestamp)
      .toLocaleString(DateTime.DATETIME_SHORT);

    /* -------------------------------
       BUILD MESSAGE
    --------------------------------*/

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

    /* -------------------------------
       ENCODE MESSAGE
    --------------------------------*/

    const encodedText = encodeURIComponent(messageText);

    /* -------------------------------
       CREATE WHATSAPP LINK
    --------------------------------*/

    const whatsappURL =
      `https://wa.me/${phoneNumber}?text=${encodedText}`;

    console.log(`WhatsApp link created for ${student.name}:`);
    console.log(whatsappURL);

    /* -------------------------------
       RESPONSE OBJECT
    --------------------------------*/

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

    console.error('Error generating WhatsApp link:', error);

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