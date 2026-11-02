import mongoose from 'mongoose';
import { logError, logWarning } from '../utils/logging/terminal.js';
import {
  isFirebaseMirrorConfigured,
  startStudentMirror,
  stopStudentMirror,
  syncAllStudentsToFirebase,
} from '../integrations/firebase/student/firebaseMirrorService.js';
import {
  startStudentProfileEditSync,
  stopStudentProfileEditSync,
  syncPendingStudentProfileEdits,
} from '../integrations/firebase/student/studentProfileEditSyncService.js';

let reconciliationStarted = false;
let reconciliationTimer;

const isQuotaError = (error) => {
  let current = error;
  while (current) {
    if (current.code === 'FIREBASE_DAILY_LIMIT') return true;
    current = current.cause;
  }
  return false;
};

export const startStudentFirebase = async () => {
  if (!isFirebaseMirrorConfigured()) return false;
  startStudentMirror();
  startStudentProfileEditSync();
  return true;
};

export const reconcileStudentFirebase = async () => {
  if (reconciliationStarted) return;
  if (mongoose.connection.readyState !== 1) {
    reconciliationTimer = setTimeout(reconcileStudentFirebase, 30000);
    reconciliationTimer.unref?.();
    return;
  }

  try {
    await syncPendingStudentProfileEdits();
    const result = await syncAllStudentsToFirebase({ failOnSkipped: false });
    if (result.skipped) logWarning(`Startup reconciliation skipped ${result.skipped} invalid student record(s).`);
    reconciliationStarted = true;
  } catch (error) {
    logError(`Firebase startup reconciliation failed: ${error.message}`);
    const delay = isQuotaError(error) ? Math.max(1000, new Date().setUTCHours(24, 0, 0, 0) - Date.now()) : 30000;
    reconciliationTimer = setTimeout(reconcileStudentFirebase, delay);
    reconciliationTimer.unref?.();
  }
};

export const stopStudentFirebase = async () => {
  if (reconciliationTimer) clearTimeout(reconciliationTimer);
  await stopStudentMirror();
  await stopStudentProfileEditSync();
};
