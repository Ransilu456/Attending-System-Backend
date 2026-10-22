import { logInfo, logError } from '../utils/terminal.js';
import { autoMarkLeaveAttendance, checkAllPastAttendance, updateStudentStatuses } from './autoAttendanceService.js';
import { syncAllStudentAttendanceRates } from '../sync_attendance_rates.js';

const DAILY_PROCESSING_TIMES = [
  { hour: 0, minute: 0, label: 'midnight' },
  { hour: 6, minute: 30, label: '6:30 AM' },
];

let dailyTask = Promise.resolve();
let activeDailyTask = Promise.resolve();
let schedulerStopped = false;
const timers = new Set();

const runDailyProcessing = (trigger) => {
  const task = dailyTask.then(async () => {
    if (schedulerStopped) return;
    logInfo(`Starting attendance processing (${trigger})...`);
    await checkAllPastAttendance();
    await syncAllStudentAttendanceRates();
    logInfo(`Attendance processing completed (${trigger}); MongoDB changes are mirrored incrementally.`);
  }).catch((error) => {
    logError(`Attendance processing failed (${trigger}): ${error.message}`);
  });
  dailyTask = task;
  activeDailyTask = task;
  return task;
};

const scheduleDailyProcessing = ({ hour, minute, label }) => {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);

  const timer = setTimeout(async () => {
    timers.delete(timer);
    await runDailyProcessing(label);
    if (!schedulerStopped) scheduleDailyProcessing({ hour, minute, label });
  }, target.getTime() - now.getTime());
  timers.add(timer);
  timer.unref?.();
  logInfo(`Next attendance processing scheduled for: ${target.toLocaleString()}`);
};

const scheduleAutoCheckout = () => {
  const now = new Date();
  const target = new Date(now);
  target.setHours(18, 45, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);

  const timer = setTimeout(async () => {
    timers.delete(timer);
    if (!schedulerStopped) {
      try {
        await autoMarkLeaveAttendance();
        await updateStudentStatuses();
      } catch (error) {
        logError(`Error in scheduled auto-mark attendance task: ${error.message}`);
      }
      if (!schedulerStopped) scheduleAutoCheckout();
    }
  }, target.getTime() - now.getTime());
  timers.add(timer);
  timer.unref?.();
  logInfo(`Next auto-mark attendance task scheduled for: ${target.toLocaleString()}`);
};

export const startScheduler = () => {
  if (timers.size || schedulerStopped) return;
  try {
    logInfo('Starting scheduler service...');
    schedulerStopped = false;
    runDailyProcessing('server startup');
    DAILY_PROCESSING_TIMES.forEach(scheduleDailyProcessing);
    scheduleAutoCheckout();
    logInfo('Scheduler service started successfully');
  } catch (error) {
    logError(`Error starting scheduler service: ${error.message}`);
    throw error;
  }
};

export const stopScheduler = async () => {
  schedulerStopped = true;
  timers.forEach(clearTimeout);
  timers.clear();
  await activeDailyTask;
};