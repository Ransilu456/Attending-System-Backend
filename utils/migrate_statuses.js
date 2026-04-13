import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from '../models/student.model.js';
import { connectDB } from '../config/database.js';
import { logInfo, logError, logSuccess } from '../utils/terminal.js';

dotenv.config();

const migrateStudentStatuses = async () => {
  try {
    await connectDB();
    logInfo('Starting one-time student status migration...');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Find active students with 0 total attendance records who were registered more than 7 days ago
    const students = await Student.find({
      status: 'active',
      attendanceHistory: { $size: 0 },
      createdAt: { $lt: sevenDaysAgo }
    });

    if (!students.length) {
      logInfo('No students found eligible for inactive status update.');
      process.exit(0);
    }

    logInfo(`Found ${students.length} students to mark as inactive.`);

    let updatedCount = 0;
    for (const student of students) {
      await Student.findByIdAndUpdate(student._id, { status: 'inactive' });
      updatedCount++;
      logInfo(`Updated student ${updatedCount}/${students.length}: ${student.name} [${student.indexNumber}]`);
    }

    logSuccess(`Successfully migrated ${updatedCount} students to inactive status.`);
    process.exit(0);
  } catch (error) {
    logError(`Migration failed: ${error.message}`);
    process.exit(1);
  }
};

migrateStudentStatuses();
