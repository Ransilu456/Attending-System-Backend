import Student from '../models/student.model.js';
import { DateTime } from 'luxon';

export const sendAttendanceNotificationLink = async (studentId, status, timestamp) => {
  try {
    const student = await Student.findById(studentId);
    if (!student) {
      console.log(`Student not found with ID: ${studentId}`);
      return { success: false, error: 'Student not found', code: 'STUDENT_NOT_FOUND' };
    }

    if (!student.parent_telephone) {
      console.log(`No parent phone number available for student: ${student.name} (${student.indexNumber})`);
      return { success: false, error: 'No parent phone number available', code: 'NO_PHONE_NUMBER' };
    }

    // ✅ Strip "+" and keep digits only
    const phoneNumber = (student.parent_telephone || '').replace(/\D/g, '');
    if (!phoneNumber || phoneNumber.length < 8) {
      return { success: false, error: 'Invalid phone number format', code: 'INVALID_PHONE' };
    }

    // ✅ Convert status to readable form
    const displayStatus =
      status === 'entered' ? 'Entered School'
      : status === 'left' ? 'Left School'
      : status?.charAt(0).toUpperCase() + status?.slice(1);

    const scanTime = DateTime.now().toLocaleString(DateTime.DATETIME_SHORT);

    // ✅ Build message with safe defaults
    const messageText = [
      '*Attendance Update*',
      '',
      `Student: *${student.name || 'N/A'}*`,
      `Index Number: *${student.indexNumber || 'N/A'}*`,
      `Status: *${displayStatus || 'N/A'}*`,
      `Time: *${scanTime}*`,
      '',
      'Additional Details:',
      `Email: ${student.student_email || 'N/A'}`,
      `Parent Phone: ${student.parent_telephone || 'N/A'}`,
      `Address: ${student.address || 'N/A'}`
    ].join('\n');

    // ✅ Encode message properly
    const encodedText = encodeURIComponent(messageText);

    // ✅ Use api.whatsapp.com (reliable across devices)
    const whatsappURL = `https://api.whatsapp.com/send?phone=${phoneNumber}&text=${encodedText}&type=phone_number&app_absent=0`;

    console.log(`✅ WhatsApp URL for ${student.name}: ${whatsappURL}`);

    const studentData = {
      name: student.name,
      indexNumber: student.indexNumber,
      student_email: student.student_email,
      parentPhone: student.parent_telephone,
      address: student.address,
      status: displayStatus,
      timestamp: scanTime
    };

    return { success: true, whatsappURL, student: studentData };

  } catch (error) {
    console.error('Error generating WhatsApp link:', error);
    return { success: false, error: error.message, code: 'LINK_GENERATION_ERROR' };
  }
};

export default { sendAttendanceNotificationLink };
