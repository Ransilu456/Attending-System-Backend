import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Student from '../../models/student.model.js';
import { getFirebaseAdmin } from '../../config/firebase.js';
import { mirrorStudent } from '../../services/firebaseMirrorService.js';

dotenv.config();

const args = new Map(process.argv.slice(2).map((value) => {
  const separator = value.indexOf('=');
  return separator > -1
    ? [value.slice(0, separator).replace(/^--/, ''), value.slice(separator + 1)]
    : [value.replace(/^--/, ''), true];
}));

const requestedLimit = args.has('limit') ? Number(args.get('limit')) : null;
const limit = requestedLimit ?? Infinity;
const afterId = args.get('after') || null;

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
if (requestedLimit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 10000)) {
  throw new Error('--limit must be an integer between 1 and 10000.');
}
if (afterId && !mongoose.isValidObjectId(afterId)) {
  throw new Error('--after must be a valid MongoDB ObjectId.');
}
if (!getFirebaseAdmin()) {
  throw new Error('Configure Firebase Admin credentials before running this migration.');
}

let migrated = 0;
let failed = 0;
let lastId = afterId;
let failedStudentId = null;

try {
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    family: 4,
  });

  const query = afterId ? { _id: { $gt: new mongoose.Types.ObjectId(afterId) } } : {};
  const students = Student.find(query)
    .sort({ _id: 1 })
    .limit(Number.isFinite(limit) ? limit : 0)
    .lean()
    .cursor();

  for await (const student of students) {
    try {
      await mirrorStudent(student);
      migrated += 1;
      lastId = String(student._id);
    } catch (error) {
      failed += 1;
      failedStudentId = String(student._id);
      console.error(`Failed to migrate student ${student._id}: ${error.message}`);
      break;
    }
  }

  console.log(JSON.stringify({
    migrated,
    failed,
    lastId,
    failedStudentId,
    nextCommand: (migrated === limit || failed > 0) && lastId
      ? `npm run migrate:firebase -- --after=${lastId}${requestedLimit !== null ? ` --limit=${limit}` : ''}`
      : null,
  }, null, 2));

  if (failed) process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
