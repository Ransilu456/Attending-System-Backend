import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getFirebaseAdmin } from '../config/firebase.js';

const DEFAULT_DAILY_READ_LIMIT = 40000;
const DEFAULT_DAILY_WRITE_LIMIT = 18000;
const STUDENT_DOCUMENT_CACHE_MS = 30_000;
const RENAME_RETRY_DELAYS_MS = [50, 100, 200, 400, 800];
const TRANSIENT_FILE_ERROR_CODES = new Set(['EBUSY', 'EACCES', 'EPERM']);

let usageState;
let usageDate;
let operationQueue = Promise.resolve();
const studentDocumentCache = new Map();
const pendingStudentReads = new Map();

const getUsagePath = () => process.env.FIREBASE_QUOTA_USAGE_PATH
  ? path.resolve(process.env.FIREBASE_QUOTA_USAGE_PATH)
  : path.join(process.cwd(), '.firebase-quota-usage.json');

const getDailyLimit = (operation) => {
  const envName = operation === 'read'
    ? 'FIREBASE_DAILY_READ_LIMIT'
    : 'FIREBASE_DAILY_WRITE_LIMIT';
  const defaultLimit = operation === 'read'
    ? DEFAULT_DAILY_READ_LIMIT
    : DEFAULT_DAILY_WRITE_LIMIT;
  const limit = Number(process.env[envName] || defaultLimit);
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error(`${envName} must be a positive safe integer.`);
  }
  return limit;
};

const getUtcDate = () => new Date().toISOString().slice(0, 10);

const renameWithRetry = async (source, destination) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(source, destination);
      return;
    } catch (error) {
      const delay = RENAME_RETRY_DELAYS_MS[attempt];
      if (!delay || !TRANSIENT_FILE_ERROR_CODES.has(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

const loadUsage = async () => {
  const today = getUtcDate();
  if (usageState && usageDate === today) return usageState;

  let stored;
  try {
    stored = JSON.parse(await fs.readFile(getUsagePath(), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Could not read Firebase quota state: ${error.message}`, { cause: error });
    }
  }

  const nextState = stored?.date === today
    ? { date: today, reads: stored.reads, writes: stored.writes }
    : { date: today, reads: 0, writes: 0 };

  for (const key of ['reads', 'writes']) {
    if (!Number.isSafeInteger(nextState[key]) || nextState[key] < 0) {
      throw new Error(`Firebase quota state has an invalid ${key} counter.`);
    }
  }
  usageDate = today;
  usageState = nextState;
  return nextState;
};

const persistUsage = async (state) => {
  const usagePath = getUsagePath();
  await fs.mkdir(path.dirname(usagePath), { recursive: true });
  const temporaryPath = `${usagePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, JSON.stringify(state), { encoding: 'utf8', flag: 'wx' });
    await renameWithRetry(temporaryPath, usagePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw new Error(`Could not persist Firebase quota state: ${error.message}`, { cause: error });
  }
};

const reserveOperation = (operation) => {
  const reservation = operationQueue.then(async () => {
    const state = await loadUsage();
    const key = operation === 'read' ? 'reads' : 'writes';
    const limit = getDailyLimit(operation);
    if (state[key] >= limit) {
      const error = new Error(
        `The student data service has reached its daily Firebase ${operation} limit. Please try again after the daily reset.`
      );
      error.code = 'FIREBASE_DAILY_LIMIT';
      error.statusCode = 429;
      throw error;
    }

    const updated = { ...state, [key]: state[key] + 1 };
    await persistUsage(updated);
    usageState = updated;
    return updated[key];
  });
  operationQueue = reservation.catch(() => {});
  return reservation;
};

export const runFirebaseRead = async (operation) => {
  await reserveOperation('read');
  try {
    return await operation();
  } catch (error) {
    if (error.code === 8 || error.code === 'resource-exhausted') {
      const quotaError = new Error('Firebase reported that its daily read capacity is exhausted.', {
        cause: error,
      });
      quotaError.code = 'FIREBASE_DAILY_LIMIT';
      quotaError.statusCode = 429;
      throw quotaError;
    }
    throw error;
  }
};

export const runFirebaseWrite = async (operation) => {
  await reserveOperation('write');
  try {
    return await operation();
  } catch (error) {
    if (error.code === 8 || error.code === 'resource-exhausted') {
      const quotaError = new Error('Firebase reported that its daily write capacity is exhausted.', {
        cause: error,
      });
      quotaError.code = 'FIREBASE_DAILY_LIMIT';
      quotaError.statusCode = 429;
      throw quotaError;
    }
    throw error;
  }
};

export const readStudentDocument = async (studentId, { forceRefresh = false } = {}) => {
  const firebase = getFirebaseAdmin();
  if (!firebase) throw new Error('Firebase Admin is not configured.');

  const cached = studentDocumentCache.get(studentId);
  if (!forceRefresh && cached && Date.now() - cached.cachedAt < STUDENT_DOCUMENT_CACHE_MS) {
    return cached.data;
  }
  if (!forceRefresh && pendingStudentReads.has(studentId)) {
    return pendingStudentReads.get(studentId);
  }

  const readTask = runFirebaseRead(async () => {
    const snapshot = await firebase.firestore.collection('students').doc(studentId).get();
    if (!snapshot.exists) return null;
    return snapshot.data();
  }).then((data) => {
    studentDocumentCache.set(studentId, { data, cachedAt: Date.now() });
    return data;
  }).finally(() => {
    if (pendingStudentReads.get(studentId) === readTask) pendingStudentReads.delete(studentId);
  });

  pendingStudentReads.set(studentId, readTask);
  return readTask;
};

export const writeStudentDocument = async (studentId, data) => {
  const firebase = getFirebaseAdmin();
  if (!firebase) throw new Error('Firebase Admin is not configured.');
  await runFirebaseWrite(() =>
    firebase.firestore.collection('students').doc(studentId).set(data)
  );
  studentDocumentCache.delete(studentId);
};

export const deleteStudentDocument = async (studentId) => {
  const firebase = getFirebaseAdmin();
  if (!firebase) throw new Error('Firebase Admin is not configured.');
  await runFirebaseWrite(() =>
    firebase.firestore.collection('students').doc(studentId).delete()
  );
  studentDocumentCache.delete(studentId);
};

export const getFirebaseQuotaUsage = async () => {
  const state = await loadUsage();
  return {
    date: state.date,
    reads: state.reads,
    readLimit: getDailyLimit('read'),
    writes: state.writes,
    writeLimit: getDailyLimit('write'),
  };
};
