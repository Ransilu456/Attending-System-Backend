import mongoose from 'mongoose';
import Student from '../models/student.model.js';
import { getFirebaseAdmin } from '../config/firebase.js';
import {
  runFirebaseRead,
  runFirebaseWrite,
} from './firebaseQuotaService.js';
import { mirrorStudent } from './firebaseMirrorService.js';
import {
  isProfileEditVersionCurrent,
  normalizeStudentProfileUpdates,
} from '../utils/studentProfileEdits.js';
import { logError, logInfo } from '../utils/terminal.js';

const POLL_INTERVAL_MS = 30_000;
const BATCH_SIZE = 50;

let syncTimer;
let syncTask;
let stopped = true;

const setRequestStatus = (requestRef, status, message) =>
  runFirebaseWrite(() => requestRef.update({
    status,
    ...(message ? { syncMessage: message } : {}),
    syncedAt: new Date(),
  }));

const processEditRequest = async (snapshot) => {
  const requestRef = snapshot.ref;
  const request = snapshot.data();
  const studentId = requestRef.parent.parent?.id;
  if (!studentId || request.studentId !== studentId) {
    await setRequestStatus(requestRef, 'rejected', 'Student identity did not match.');
    return;
  }
  if (!mongoose.isValidObjectId(studentId)) {
    await setRequestStatus(requestRef, 'rejected', 'Student record identifier is invalid.');
    return;
  }

  const normalized = normalizeStudentProfileUpdates(request.updates);
  if (normalized.error) {
    await setRequestStatus(requestRef, 'rejected', normalized.error);
    return;
  }

  const baseUpdatedAt = request.baseUpdatedAt?.toDate?.();
  if (!(baseUpdatedAt instanceof Date) || Number.isNaN(baseUpdatedAt.getTime())) {
    await setRequestStatus(requestRef, 'rejected', 'The profile version is missing. Reload your profile and retry.');
    return;
  }

  const selectedFields = Object.keys(normalized.updates).join(' ');
  const currentStudent = await Student.findById(studentId)
    .select(`_id updatedAt ${selectedFields}`)
    .lean();
  if (!currentStudent) {
    await setRequestStatus(requestRef, 'rejected', 'Student record no longer exists.');
    return;
  }

  const updatesAlreadyApplied = await Student.findOne({
    _id: studentId,
    updatedAt: { $ne: baseUpdatedAt },
    ...normalized.updates,
  }).lean();
  if (updatesAlreadyApplied) {
    await mirrorStudent(updatesAlreadyApplied);
    await setRequestStatus(requestRef, 'synced');
    return;
  }

  if (!isProfileEditVersionCurrent(baseUpdatedAt, currentStudent.updatedAt)) {
    await setRequestStatus(
      requestRef,
      'conflict',
      'The profile changed on the teacher server. Reload the profile and submit your edits again.'
    );
    return;
  }

  try {
    const updatedStudent = await Student.findOneAndUpdate(
      { _id: studentId, updatedAt: currentStudent.updatedAt },
      { $set: normalized.updates },
      { new: true, runValidators: true },
    ).lean();

    if (!updatedStudent) {
      await setRequestStatus(
        requestRef,
        'conflict',
        'The profile changed on the teacher server. Reload the profile and submit your edits again.'
      );
      return;
    }
    await mirrorStudent(updatedStudent);
  } catch (error) {
    if (error.name === 'ValidationError' || error.code === 11000) {
      await setRequestStatus(requestRef, 'rejected', 'The profile changes are invalid or conflict with another student.');
      return;
    }
    throw error;
  }

  await setRequestStatus(requestRef, 'synced');
  logInfo(`Applied offline profile edit for student ${studentId}.`);
};

const syncPendingEdits = async () => {
  const firebase = getFirebaseAdmin();
  if (!firebase) throw new Error('Firebase Admin is not configured.');

  while (true) {
    const pendingEdits = await runFirebaseRead(() =>
      firebase.firestore
        .collectionGroup('requests')
        .where('status', '==', 'pending')
        .limit(BATCH_SIZE)
        .get()
    );
    const errors = [];

    for (const edit of pendingEdits.docs) {
      try {
        await processEditRequest(edit);
      } catch (error) {
        logError(`Could not sync offline profile edit ${edit.id}: ${error.message}`);
        errors.push(error);
      }
    }

    if (errors.length) {
      throw new Error(`Could not reconcile ${errors.length} pending Firebase profile edit(s).`, {
        cause: errors[0],
      });
    }
    if (pendingEdits.size < BATCH_SIZE) return;
  }
};

const runSyncLoop = () => {
  if (syncTask) return syncTask;
  syncTask = syncPendingEdits().finally(() => { syncTask = null; });
  return syncTask;
};

export const syncPendingStudentProfileEdits = async () => {
  await runSyncLoop();
};

export const startStudentProfileEditSync = () => {
  if (!stopped) return;
  if (!getFirebaseAdmin()) {
    logInfo('Offline student profile sync is disabled because Firebase Admin is not configured.');
    return;
  }

  stopped = false;
  void runSyncLoop().catch((error) => logError(`Offline student profile sync failed: ${error.message}`));
  syncTimer = setInterval(() => {
    void runSyncLoop().catch((error) => logError(`Offline student profile sync failed: ${error.message}`));
  }, POLL_INTERVAL_MS);
  syncTimer.unref?.();
  logInfo('Offline student profile sync is watching Firebase requests for MongoDB.');
};

export const stopStudentProfileEditSync = async () => {
  stopped = true;
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = undefined;
  if (syncTask) await syncTask;
};
