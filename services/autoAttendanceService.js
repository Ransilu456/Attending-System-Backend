import { logInfo, logWarning, logError } from '../utils/terminal.js';
import Student from '../models/student.model.js';


export const autoMarkLeaveAttendance = async () => {
  try {
    logInfo('Starting automatic leave attendance marking process...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const students = await Student.find({
      'attendanceHistory.date': {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      },
      'attendanceHistory.status': { $in: ['entered', 'present'] },
      'attendanceHistory.leaveTime': null
    });

    if (!students.length) {
      logInfo('No students found who need automatic leave marking');
      return;
    }

    logInfo(`Found ${students.length} students who need automatic leave marking`);

    const leaveTime = new Date();
    leaveTime.setHours(18, 30, 0, 0);

    for (const student of students) {
      try {
        const todayAttendanceIndex = student.attendanceHistory.findIndex(
          record => record.date.toDateString() === today.toDateString() &&
            ['entered', 'present'].includes(record.status) &&
            !record.leaveTime
        );

        if (todayAttendanceIndex === -1) {
          logWarning(`No eligible attendance record found for student: ${student.name}`);
          continue;
        }

        student.attendanceHistory[todayAttendanceIndex].leaveTime = leaveTime;
        student.attendanceHistory[todayAttendanceIndex].status = 'left';

        student.lastAttendance = leaveTime;

        const totalRecords = student.attendanceHistory.length;
        const presentRecords = student.attendanceHistory.filter(record =>
          record.status === 'present' || record.status === 'entered'
        ).length;

        student.attendancePercentage = totalRecords > 0
          ? (presentRecords / totalRecords) * 100
          : 0;

        await student.save();

        logInfo(`Successfully marked leave attendance for student: ${student.name}`);
      } catch (error) {
        logError(`Error processing student ${student.name}: ${error.message}`);
      }
    }

    logInfo('Completed automatic leave attendance marking process');
  } catch (error) {
    logError(`Error in autoMarkLeaveAttendance: ${error.message}`);
    throw error;
  }
};

export const checkAllPastAttendance = async () => {
  try {
    logInfo('Checking all past attendance records...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const students = await Student.find({
      'attendanceHistory': {
        $elemMatch: {
          date: { $lt: today },
          status: { $in: ['entered', 'present'] },
          leaveTime: null
        }
      }
    });

    if (!students.length) {
      logInfo('No incomplete attendance records found from past days');
      return;
    }

    logInfo(`Found ${students.length} students with incomplete past attendance records`);

    for (const student of students) {
      try {
        const incompleteRecords = student.attendanceHistory.filter(
          record => record.date < today &&
            ['entered', 'present'].includes(record.status) &&
            !record.leaveTime
        );

        for (const record of incompleteRecords) {
          const leaveTime = new Date(record.date);
          leaveTime.setHours(18, 30, 0, 0);

          record.leaveTime = leaveTime;
          record.status = 'left';
        }

        if (incompleteRecords.length > 0) {
          const lastRecord = [...incompleteRecords].sort((a, b) => b.date - a.date)[0];
          student.lastAttendance = lastRecord.leaveTime;

          const totalRecords = student.attendanceHistory.length;
          const presentRecords = student.attendanceHistory.filter(record =>
            record.status === 'present' || record.status === 'entered'
          ).length;

          student.attendancePercentage = totalRecords > 0
            ? (presentRecords / totalRecords) * 100
            : 0;

          await student.save();

          logInfo(`Successfully marked past attendance for student: ${student.name}`);
        }
      } catch (error) {
        logError(`Error processing past attendance for student ${student.name}: ${error.message}`);
      }
    }

    logInfo('Completed checking all past attendance records');
  } catch (error) {
    logError(`Error in checkAllPastAttendance: ${error.message}`);
    throw error;
  }
};

export const checkPreviousDayAttendance = async () => {
  try {

    await checkAllPastAttendance();

    logInfo('Checking previous day attendance records...');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const students = await Student.find({
      'attendanceHistory.date': {
        $gte: yesterday,
        $lt: yesterdayEnd
      },
      'attendanceHistory.status': { $in: ['entered', 'present'] },
      'attendanceHistory.leaveTime': null
    });

    if (!students.length) {
      logInfo('No incomplete attendance records found from previous day');
      return;
    }

    logInfo(`Found ${students.length} incomplete attendance records from previous day`);

    const leaveTime = new Date(yesterday);
    leaveTime.setHours(18, 30, 0, 0);

    for (const student of students) {
      try {
        const attendanceIndex = student.attendanceHistory.findIndex(
          record => record.date >= yesterday &&
            record.date < yesterdayEnd &&
            ['entered', 'present'].includes(record.status) &&
            !record.leaveTime
        );

        if (attendanceIndex === -1) continue;

        student.attendanceHistory[attendanceIndex].leaveTime = leaveTime;
        student.attendanceHistory[attendanceIndex].status = 'left';

        student.lastAttendance = leaveTime;

        const totalRecords = student.attendanceHistory.length;
        const presentRecords = student.attendanceHistory.filter(record =>
          record.status === 'present' || record.status === 'entered'
        ).length;

        student.attendancePercentage = totalRecords > 0
          ? (presentRecords / totalRecords) * 100
          : 0;

        await student.save();

        logInfo(`Successfully marked previous day attendance for student: ${student.name}`);
      } catch (error) {
        logError(`Error processing previous day attendance for student ${student.name}: ${error.message}`);
      }
    }

    logInfo('Completed checking previous day attendance records');
  } catch (error) {
    logError(`Error in checkPreviousDayAttendance: ${error.message}`);
    throw error;
  }
};

export const updateStudentStatuses = async () => {
  try {
    logInfo('Starting student status update process...');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find active students to mark as inactive based on:
    // 1. Registered > 7 days ago and 0 attendance records
    // 2. Registered > 30 days ago and <= 1 attendance record
    const students = await Student.find({
      status: 'active',
      $or: [
        { 
          attendanceHistory: { $size: 0 }, 
          createdAt: { $lt: sevenDaysAgo } 
        },
        { 
          attendanceCount: { $lte: 1 }, 
          createdAt: { $lt: thirtyDaysAgo } 
        }
      ]
    });

    if (!students.length) {
      logInfo('No students found eligible for inactive status update');
      return { updatedCount: 0 };
    }

    logInfo(`Found ${students.length} students to mark as inactive`);

    let updatedCount = 0;
    for (const student of students) {
      student.status = 'inactive';
      await student.save();
      updatedCount++;
    }

    logInfo(`Successfully marked ${updatedCount} students as inactive`);
    return { updatedCount };
  } catch (error) {
    logError(`Error in updateStudentStatuses: ${error.message}`);
    throw error;
  }
};