import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from '../../models/student.model.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/attendance"; // Fallback if needed

async function migrate() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('🚀 Connected to MongoDB');

        const students = await Student.find({ age: { $exists: true } });
        console.log(`📊 Found ${students.length} students to migrate`);

        for (let i = 0; i < students.length; i++) {
            const student = students[i];
            const age = student.get('age'); // Get the raw age field

            if (age !== undefined && age !== null) {
                // Approximate DOB: (age + 1) years ago from today, set to Jan 1st for consistency
                const today = new Date();
                const birthYear = today.getFullYear() - (age + 1);
                const dateOfBirth = new Date(birthYear, 0, 1);

                console.log(`🔄 [${i + 1}/${students.length}] Migrating ${student.name} (Age: ${age} -> DOB: ${dateOfBirth.toISOString().split('T')[0]})`);

                // Update document: set DOB and unset age
                await Student.updateOne(
                    { _id: student._id },
                    {
                        $set: { dateOfBirth: dateOfBirth },
                        $unset: { age: "" }
                    }
                );

                // Safety delay for Free Tier (M0)
                await new Promise(resolve => setTimeout(resolve, 30));
            }
        }

        console.log('✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrate();
