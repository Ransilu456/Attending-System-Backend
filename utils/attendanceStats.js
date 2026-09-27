import Student from '../models/student.model.js';

let cachedSessionDates = null;
let lastCacheTime = 0;
const CACHE_TTL = 60 * 1000; 

// Retrieve all unique calendar dates on which at least one student attended
export async function getSystemSessionDates() {
  const now = Date.now();
  if (cachedSessionDates && (now - lastCacheTime < CACHE_TTL)) {
    return cachedSessionDates;
  }

  try {
    const dates = await Student.distinct('attendanceHistory.date');
    const daySet = new Set(
      dates
        .filter(Boolean)
        .map(d => new Date(d).toISOString().split('T')[0])
    );
    cachedSessionDates = daySet;
    lastCacheTime = now;
    return daySet;
  } catch {
    return cachedSessionDates || new Set();
  }
}

// Invalidate session dates cache when new attendance is recorded
export function invalidateSessionDatesCache() {
  cachedSessionDates = null;
  lastCacheTime = 0;
}

/**
 * Accurately compute student attendance metrics according to institution rules:
 * 1. Attended days = all entries with 'left', 'entered', or 'present'
 * 2. Today's active entry (even if not yet marked as 'left') counts towards attended days today
 * 3. Attendance rate calculated from student registration date (createdAt)
 * 4. Monthly distribution rates with actual attended vs held sessions
 */
export function calculateStudentAttendanceStats(student, allSessionDatesSet = new Set(), startDate = null, endDate = null) {
  const history = student.attendanceHistory || [];
  const todayStr = new Date().toISOString().split('T')[0];

  // Whitelist date filtering if provided
  const filtered = history.filter(r => {
    if (!r.date) return false;
    const d = new Date(r.date);
    if (startDate && d < new Date(startDate)) return false;
    if (endDate && d > new Date(new Date(endDate).setHours(23, 59, 59, 999))) return false;
    return true;
  });

  const attendedDaysSet = new Set();
  let inClassToday = false;
  let leftToday = false;
  let todayRecordFound = false;

  filtered.forEach(r => {
    if (['present', 'entered', 'left'].includes(r.status)) {
      const dStr = new Date(r.date).toISOString().split('T')[0];
      attendedDaysSet.add(dStr);
      if (dStr === todayStr) {
        todayRecordFound = true;
        if (r.status === 'left' || r.leaveTime) {
          leftToday = true;
        } else {
          inClassToday = true;
        }
      }
    }
  });

  const presentDays = attendedDaysSet.size;

  // Student registration date as baseline
  const regDate = student.createdAt ? new Date(student.createdAt) : (filtered[0]?.date ? new Date(filtered[0].date) : new Date());
  const regDayStr = regDate.toISOString().split('T')[0];
  const endDayStr = endDate ? new Date(endDate).toISOString().split('T')[0] : todayStr;

  // Total school session days held since registration
  let expectedSessions = 0;
  if (allSessionDatesSet && allSessionDatesSet.size > 0) {
    for (const d of allSessionDatesSet) {
      if (d >= regDayStr && d <= endDayStr) {
        expectedSessions++;
      }
    }
  }

  // Ensure expected sessions is at least the days this student attended
  expectedSessions = Math.max(expectedSessions, presentDays);

  const attendancePercentage = expectedSessions > 0
    ? Math.min(100, Math.round((presentDays / expectedSessions) * 100))
    : (presentDays > 0 ? 100 : 0);


  const monthlyDistribution = [];
  const now = new Date();
  
  // Look back over the past 6 months
  for (let i = 5; i >= 0; i--) {
    const target = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = target.getFullYear();
    const m = target.getMonth();
    const mStr = `${y}-${String(m + 1).padStart(2, '0')}`;
    const label = target.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();

    // Attended days in this month
    let mAttended = 0;
    for (const dStr of attendedDaysSet) {
      if (dStr.startsWith(mStr)) mAttended++;
    }

    // Sessions held in this month since registration
    let mTotal = 0;
    if (allSessionDatesSet) {
      for (const d of allSessionDatesSet) {
        if (d.startsWith(mStr) && d >= regDayStr && d <= todayStr) {
          mTotal++;
        }
      }
    }
    mTotal = Math.max(mTotal, mAttended);

    const pct = mTotal > 0 ? Math.min(100, Math.round((mAttended / mTotal) * 100)) : (mAttended > 0 ? 100 : 0);

    monthlyDistribution.push({
      key: mStr,
      label,
      attended: mAttended,
      total: mTotal,
      pct
    });
  }

  let todayStatusText = 'Not Attended Today';
  let todayStatusCode = 'not_attended';
  if (inClassToday) {
    todayStatusText = 'Currently In Class';
    todayStatusCode = 'in_class';
  } else if (leftToday) {
    todayStatusText = 'Attended Today (Left)';
    todayStatusCode = 'left';
  }

  return {
    totalRecords: filtered.length,
    presentCount: presentDays,
    todayStatus: todayStatusCode,
    todayStatusLabel: todayStatusText,
    attendancePercentage,
    expectedSessions,
    monthlyDistribution
  };
}
