import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import Student from '../models/student.model.js';
import { getFirebaseAdmin } from '../config/firebase.js';
import {
  deleteStudentDocument,
  readStudentDocument,
  writeStudentDocument,
} from './firebaseQuotaService.js';
import { logError, logInfo, logWarning } from '../utils/terminal.js';

const getResumeTokenPath = () => process.env.FIREBASE_SYNC_TOKEN_PATH
  ? path.resolve(process.env.FIREBASE_SYNC_TOKEN_PATH)
  : path.join(process.cwd(), '.firebase-sync-token.json');

let mirrorTask;
let activeStream;
let stopRequested = false;
const studentMirrorTasks = new Map();

const permanentMirrorError = (message) =>
  Object.assign(new Error(message), { permanent: true });

const isObjectId = (value) => value?._bsontype === 'ObjectId' ||
  value instanceof mongoose.Types.ObjectId;

const toFirestoreValue = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value instanceof Date || typeof value !== 'object') return value;
  if (isObjectId(value)) return value.toString();
  if (Array.isArray(value)) return value.map(toFirestoreValue);

  const source = typeof value.toObject === 'function'
    ? value.toObject({ depopulate: true, virtuals: false })
    : value;
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key, child]) => key !== '__v' && child !== undefined)
      .map(([key, child]) => [key, toFirestoreValue(child)])
  );
};

const toComparableValue = (value) => {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toComparableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, toComparableValue(value[key])])
    );
  }
  return value;
};

const getStudentData = (student) => {
  const data = toFirestoreValue(student);
  delete data.__v;
  delete data.messages;
  delete data.notifications;
  delete data.notificationHistory;
  data._id = String(student._id);
  if (Buffer.byteLength(JSON.stringify(data)) > 900 * 1024) {
    throw permanentMirrorError(`Student ${data._id} exceeds the supported Firestore document size; split attendance history before mirroring.`);
  }
  return data;
};

const ensureStudentAuth = async (auth, student, previousData) => {
  const uid = String(student._id);
  const email = String(student.student_email || '').trim().toLowerCase();
  const phoneNumber = String(student.parent_telephone || '').replace(/\D/g, '');

  let user;
  try {
    user = await auth.getUser(uid);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    if (!email || phoneNumber.length < 10 || phoneNumber.length > 15 || /^0+$/.test(phoneNumber)) {
      throw permanentMirrorError(`Student ${uid} has no valid phone number; Firebase Auth was not synchronized.`);
    }
    user = await auth.createUser({
      uid,
      email,
      password: phoneNumber,
      displayName: student.name,
      disabled: student.status !== 'active',
    });
  }

  if (['admin', 'superadmin'].includes(user.customClaims?.role)) {
    throw permanentMirrorError(`Firebase UID ${uid} belongs to an admin account; refusing to convert it to a student.`);
  }
  if (!previousData && user.email !== email) {
    throw permanentMirrorError(`Firebase UID ${uid} already exists with a different email; refusing to take over the account.`);
  }

  const update = {};
  if (user.email !== email) update.email = email;
  if (user.displayName !== student.name) update.displayName = student.name;
  if (user.disabled !== (student.status !== 'active')) update.disabled = student.status !== 'active';
  if (Object.keys(update).length) {
    user = await auth.updateUser(uid, update);
  }

  if (user.customClaims?.role !== 'student') {
    await auth.setCustomUserClaims(uid, { ...user.customClaims, role: 'student' });
  }
};

const mirrorStudentNow = async (student) => {
  const firebase = getFirebaseAdmin();
  if (!firebase) throw new Error('Firebase Admin is not configured.');

  const uid = String(student._id);
  const previousData = await readStudentDocument(uid);
  const studentData = getStudentData(student);
  const documentChanged = !previousData ||
    JSON.stringify(toComparableValue(previousData)) !==
    JSON.stringify(toComparableValue(studentData));
  const authFieldsChanged = !previousData ||
    ['student_email', 'name', 'status', 'parent_telephone'].some((field) =>
      previousData[field] !== studentData[field]
    );

  if (authFieldsChanged) {
    await ensureStudentAuth(firebase.auth, student, previousData);
  }
  if (documentChanged) {
    await writeStudentDocument(uid, studentData);
  }
  return documentChanged;
};

export const mirrorStudent = async (student) => {
  const uid = String(student._id);
  const previousTask = studentMirrorTasks.get(uid) || Promise.resolve();
  const task = previousTask.catch(() => {}).then(() => mirrorStudentNow(student));
  studentMirrorTasks.set(uid, task);
  try {
    return await task;
  } finally {
    if (studentMirrorTasks.get(uid) === task) studentMirrorTasks.delete(uid);
  }
};

export const mirrorStudentAfterWrite = async (studentId, source) => {
  try {
    const student = await Student.findById(studentId).lean();
    if (!student) return false;
    await mirrorStudent(student);
    return true;
  } catch (error) {
    logError(`MongoDB ${source} for student ${studentId} is saved, but Firebase mirroring failed: ${error.message}`);
    return false;
  }
};

export const syncAllStudentsToFirebase = async ({ failOnSkipped = true } = {}) => {
  if (!getFirebaseAdmin()) throw new Error('Firebase Admin is not configured.');

  logInfo('Starting full MongoDB-to-Firebase student reconciliation...');
  let synced = 0;
  let unchanged = 0;
  let skipped = 0;
  const cursor = Student.find({}).sort({ _id: 1 }).lean().cursor();

  try {
    for await (const student of cursor) {
      try {
        const changed = await mirrorStudent(student);
        if (changed) synced += 1;
        else unchanged += 1;
      } catch (error) {
        if (
          error.permanent ||
          ['auth/email-already-exists', 'auth/invalid-email', 'auth/invalid-password'].includes(error.code)
        ) {
          skipped += 1;
          logError(`Firebase reconciliation could not sync student ${student._id}: ${error.message}`);
          continue;
        }
        throw new Error(`Firebase reconciliation stopped at student ${student._id}: ${error.message}`, {
          cause: error,
        });
      }
    }
  } finally {
    await cursor.close();
  }

  logInfo(`Firebase reconciliation finished: ${synced} updated, ${unchanged} unchanged, ${skipped} skipped.`);
  if (skipped && failOnSkipped) {
    throw new Error(`Firebase reconciliation skipped ${skipped} student record(s); review the preceding errors.`);
  }
  return { synced, unchanged, skipped };
};

const deleteStudentMirror = async (studentId) => {
  const firebase = getFirebaseAdmin();
  if (!firebase) return;

  await deleteStudentDocument(studentId);
  try {
    const user = await firebase.auth.getUser(studentId);
    if (user.customClaims?.role !== 'student') {
      logWarning(`Firebase Auth UID ${studentId} is not marked as a student; leaving that account untouched.`);
      return;
    }
    await firebase.auth.deleteUser(studentId);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }
};

const readResumeToken = async () => {
  try {
    return JSON.parse(await fs.readFile(getResumeTokenPath(), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};

const saveResumeToken = async (token) => {
  const resumeTokenPath = getResumeTokenPath();
  await fs.mkdir(path.dirname(resumeTokenPath), { recursive: true });
  const temporaryPath = `${resumeTokenPath}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(token), 'utf8');
  await fs.rename(temporaryPath, resumeTokenPath);
};

const processChange = async (change) => {
  if (change.operationType === 'delete') {
    await deleteStudentMirror(String(change.documentKey._id));
    return;
  }

  if (!change.fullDocument) {
    throw new Error(`MongoDB change ${change.operationType} did not include the updated student document.`);
  }
  try {
    await mirrorStudent(change.fullDocument);
  } catch (error) {
    if (
      error.permanent ||
      ['auth/email-already-exists', 'auth/invalid-email', 'auth/invalid-password'].includes(error.code)
    ) {
      logError(`Skipping Firebase mirror for student ${change.documentKey._id}: ${error.message}`);
      return;
    }
    throw error;
  }
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const consumeChangeStream = async (stream, onChange) => {
  if (typeof stream?.next !== 'function') {
    throw new TypeError('MongoDB change stream does not provide a next() method.');
  }

  while (true) {
    const change = await stream.next();
    if (!change) return;
    await onChange(change);
  }
};

const runChangeStream = async () => {
  while (!stopRequested) {
    let stream;
    let retryDelay = 10000;
    try {
      const resumeAfter = await readResumeToken();
      stream = Student.watch([], {
        fullDocument: 'updateLookup',
        ...(resumeAfter ? { resumeAfter } : {}),
      });
      activeStream = stream;
      logInfo(resumeAfter
        ? 'Firebase student mirror resumed from its saved MongoDB change token.'
        : 'Firebase student mirror is watching MongoDB changes; run the migration script for existing students.');

      await consumeChangeStream(stream, async (change) => {
        await processChange(change);
        await saveResumeToken(change._id);
      });
    } catch (error) {
      if (!stopRequested && error.code === 'FIREBASE_DAILY_LIMIT') {
        const nextUtcDay = new Date();
        nextUtcDay.setUTCHours(24, 0, 0, 0);
        retryDelay = Math.max(1000, nextUtcDay.getTime() - Date.now());
        logWarning(`Firebase daily budget reached. Student mirror will resume after the UTC reset in ${Math.ceil(retryDelay / 60000)} minutes.`);
      } else if (!stopRequested) {
        if ([260, 286].includes(error.code) ||
          ['ChangeStreamHistoryLost', 'InvalidResumeToken'].includes(error.codeName)) {
          logError('Firebase mirror resume token expired. Stop the backend, run a full Firebase migration, remove the saved resume token, and restart.');
          stopRequested = true;
        } else {
          logError(`Firebase student mirror stopped; retrying in 10 seconds: ${error.message}`);
        }
      }
    } finally {
      activeStream = null;
      if (stream) await stream.close().catch((error) => {
        logWarning(`Could not close the MongoDB change stream cleanly: ${error.message}`);
      });
    }
    if (!stopRequested) await wait(retryDelay);
  }
};

export const startStudentMirror = () => {
  if (mirrorTask || !getFirebaseAdmin()) return;
  if (mongoose.connection.readyState !== 1) {
    logWarning('Firebase mirror will start after MongoDB connects.');
    return;
  }

  stopRequested = false;
  mirrorTask = runChangeStream()
    .catch((error) => logError(`Firebase student mirror failed: ${error.message}`))
    .finally(() => { mirrorTask = null; });
};

export const stopStudentMirror = async () => {
  stopRequested = true;
  if (activeStream) await activeStream.close();
  await mirrorTask;
};

export const isFirebaseMirrorConfigured = () => Boolean(getFirebaseAdmin());
