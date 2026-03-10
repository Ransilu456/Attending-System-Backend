import mongoose from 'mongoose';
import Student from '../../models/student.model.js';

function testAge(dob, expectedAge) {
    const dummyStudent = new Student({ dateOfBirth: new Date(dob) });
    const calculatedAge = dummyStudent.age;
    console.log(`DOB: ${dob} | Expected: ${expectedAge} | Actual: ${calculatedAge} | ${expectedAge === calculatedAge ? '✅ PASS' : '❌ FAIL'}`);
}

const today = new Date();
const year = today.getFullYear();
const month = today.getMonth();
const day = today.getDate();

console.log('🧪 Testing Age Calculation Logic...');

// Birthday already happened this year
testAge(`${year - 10}-${month + 1 > 9 ? month + 1 : '0' + (month + 1)}-${day > 1 ? day - 1 : '01'}`, 10);

// Birthday is today
testAge(`${year - 15}-${month + 1 > 9 ? month + 1 : '0' + (month + 1)}-${day > 9 ? day : '0' + day}`, 15);

// Birthday is tomorrow (has not happened yet)
const tomorrow = new Date(today);
tomorrow.setDate(today.getDate() + 1);
const ty = tomorrow.getFullYear() - 20;
const tm = tomorrow.getMonth() + 1;
const td = tomorrow.getDate();
testAge(`${ty}-${tm > 9 ? tm : '0' + tm}-${td > 9 ? td : '0' + td}`, 19);

console.log('🧪 Test finished.');
