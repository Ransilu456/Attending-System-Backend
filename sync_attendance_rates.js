import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from './models/student.model.js';
import { getSystemSessionDates, calculateStudentAttendanceStats } from './utils/attendanceStats.js';

dotenv.config();

export async function syncAllStudentAttendanceRates() {
  try {
    const sessionDates = await getSystemSessionDates();
    console.log(`Loaded ${sessionDates.size} total system session dates.`);

    const students = await Student.find({}, 'name indexNumber createdAt attendanceHistory attendancePercentage attendanceCount attendanceExpectedSessions status');
    console.log(`Processing ${students.length} students...`);

    let updatedCount = 0;
    const bulkOps = [];

    for (const student of students) {
      const stats = calculateStudentAttendanceStats(student, sessionDates);
      const newPct = stats.attendancePercentage;
      const newCount = stats.presentCount;
      const expectedSessions = stats.expectedSessions;

      bulkOps.push({
        updateOne: {
          filter: { _id: student._id },
          update: {
            $set: {
              attendancePercentage: newPct,
              attendanceCount: newCount,
              attendanceExpectedSessions: expectedSessions
            }
          }
        }
      });

      if (bulkOps.length >= 100) {
        await Student.bulkWrite(bulkOps);
        updatedCount += bulkOps.length;
        bulkOps.length = 0;
      }
    }

    if (bulkOps.length > 0) {
      await Student.bulkWrite(bulkOps);
      updatedCount += bulkOps.length;
    }

    console.log(`Successfully synced attendance rates for ${updatedCount} students.`);
    return updatedCount;
  } catch (err) {
    console.error('Error syncing student attendance rates:', err);
    throw err;
  }
}

// If run directly via node
if (process.argv[1]?.endsWith('sync_attendance_rates.js')) {
  await mongoose.connect(process.env.MONGODB_URI);
  await syncAllStudentAttendanceRates();
  await mongoose.disconnect();
  process.exit(0);
}
