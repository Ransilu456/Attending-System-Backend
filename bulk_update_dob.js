import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from './models/student.model.js';

dotenv.config();

const PLACEHOLDER_DOB = new Date('2000-01-01');

async function updateMissingBirthdays() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find students where dateOfBirth is missing or null
        const result = await Student.updateMany(
            {
                $or: [
                    { dateOfBirth: { $exists: false } },
                    { dateOfBirth: null }
                ]
            },
            {
                $set: { dateOfBirth: PLACEHOLDER_DOB }
            }
        );

        console.log(`Updated ${result.modifiedCount} students with placeholder DOB: ${PLACEHOLDER_DOB.toISOString().split('T')[0]}`);

        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    } catch (err) {
        console.error('Error updating students:', err);
        process.exit(1);
    }
}

updateMissingBirthdays();
