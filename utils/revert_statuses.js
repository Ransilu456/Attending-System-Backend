import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from '../models/student.model.js';
import { connectDB } from '../config/database.js';
import { logInfo, logError, logSuccess } from '../utils/terminal.js';

dotenv.config();

const revertStudentStatuses = async () => {
  try {
    await connectDB();
    logInfo('Starting student status reversal (Inactive -> Active)...');

    const result = await Student.updateMany(
      { status: 'inactive' },
      { $set: { status: 'active' } }
    );

    logSuccess(`Successfully reverted ${result.modifiedCount} students from Inactive to Active.`);
    process.exit(0);
  } catch (error) {
    logError(`Reversal failed: ${error.message}`);
    process.exit(1);
  }
};

revertStudentStatuses();
