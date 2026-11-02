import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from '../../models/student.model.js';

dotenv.config();

const names = [
    'D Gangana Rashmika Vidushan Denipitiya',
    'W A Rison Rahul Weerakkodi',
    'R M Nethul Nethsara Rajapakshe',
    'K M Tharumini Hiyansa Kahabawa',
    'H M Vihanga Inupama Herath',
    'J M Apeksha Nethmi Siriwardana',
    'D Tharusha Kalhara'
];

import fs from 'fs';

async function findStudents() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const students = await Student.find({ name: { $in: names } });

        const data = students.map(s => ({
            id: s._id,
            name: s.name,
            indexNumber: s.indexNumber,
            dateOfBirth: s.dateOfBirth
        }));

        fs.writeFileSync('students_found.json', JSON.stringify(data, null, 2));
        console.log('Done. Saved to students_found.json');

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

findStudents();
