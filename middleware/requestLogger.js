import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';


const MAX_LOGS = 5000;
const FLUSH_INTERVAL_MS = 10000; // flush to disk every 10s
const LOGS_DIR = path.join(process.cwd(), 'logs');

// In-memory buffer
let requestLogs = [];

// Tracking state — loaded from config file on startup
let trackingEnabled = false;
let flushTimer = null;

/* ── File persistence helpers ────────────────────────────────────────────── */

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function getConfigPath() {
  return path.join(LOGS_DIR, 'tracking.json');
}

function getLogsFilePath() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(LOGS_DIR, `requests-${dateStr}.json`);
}

function loadTrackingConfig() {
  try {
    ensureLogsDir();
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw);
      trackingEnabled = config.enabled === true;
    }
  } catch {
    trackingEnabled = false;
  }
}

function saveTrackingConfig() {
  try {
    ensureLogsDir();
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify({
      enabled: trackingEnabled,
      updatedAt: new Date().toISOString(),
    }, null, 2));
  } catch (err) {
    console.error('[RequestLogger] Failed to save config:', err.message);
  }
}

function loadExistingLogs() {
  try {
    ensureLogsDir();
    const logsFile = getLogsFilePath();
    if (fs.existsSync(logsFile)) {
      const raw = fs.readFileSync(logsFile, 'utf8');
      const data = JSON.parse(raw);
      requestLogs = Array.isArray(data) ? data : data.logs || [];
      // Keep only last MAX_LOGS
      if (requestLogs.length > MAX_LOGS) {
        requestLogs = requestLogs.slice(-MAX_LOGS);
      }
    }
  } catch {
    requestLogs = [];
  }
}

function flushLogsToFile() {
  if (!trackingEnabled || requestLogs.length === 0) return;
  try {
    ensureLogsDir();
    const logsFile = getLogsFilePath();
    fs.writeFileSync(logsFile, JSON.stringify(requestLogs, null, 2));
  } catch (err) {
    console.error('[RequestLogger] Failed to flush logs:', err.message);
  }
}

function startFlushTimer() {
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(flushLogsToFile, FLUSH_INTERVAL_MS);
  // Don't keep process alive just for flush
  if (flushTimer.unref) flushTimer.unref();
}

function stopFlushTimer() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

/* ── User-Agent parser ──────────────────────────────────────────────────── */

function parseUserAgent(ua) {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };

  let browser = 'Unknown';
  let os = 'Unknown';
  let device = 'Desktop';

  if (ua.includes('Firefox/') && !ua.includes('Seamonkey')) {
    browser = 'Firefox ' + (ua.match(/Firefox\/([\d.]+)/)?.[1] || '');
  } else if (ua.includes('Edg/')) {
    browser = 'Edge ' + (ua.match(/Edg\/([\d.]+)/)?.[1] || '');
  } else if (ua.includes('OPR/') || ua.includes('Opera/')) {
    browser = 'Opera ' + (ua.match(/(?:OPR|Opera)\/([\d.]+)/)?.[1] || '');
  } else if (ua.includes('Chrome/') && !ua.includes('Edg/')) {
    browser = 'Chrome ' + (ua.match(/Chrome\/([\d.]+)/)?.[1] || '');
  } else if (ua.includes('Safari/') && ua.includes('Version/')) {
    browser = 'Safari ' + (ua.match(/Version\/([\d.]+)/)?.[1] || '');
  }

  if (ua.includes('Windows NT 10')) os = 'Windows 10/11';
  else if (ua.includes('Windows NT 6.3')) os = 'Windows 8.1';
  else if (ua.includes('Windows NT 6.1')) os = 'Windows 7';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS ' + (ua.match(/Mac OS X ([\d_]+)/)?.[1]?.replace(/_/g, '.') || '');
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android ' + (ua.match(/Android ([\d.]+)/)?.[1] || '');
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) {
    device = 'Mobile';
  } else if (ua.includes('iPad') || ua.includes('Tablet')) {
    device = 'Tablet';
  }

  return { browser, os, device };
}

function extractIdentity(req) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { type: 'anonymous', name: null, email: null, id: null };
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role === 'student') {
      return {
        type: 'student',
        name: req.student?.name || null,
        email: req.student?.student_email || null,
        id: decoded.id,
        indexNumber: decoded.indexNumber || null,
      };
    }

    return {
      type: req.admin?.role || decoded.role || 'admin',
      name: req.admin?.name || null,
      email: req.admin?.email || null,
      id: decoded.id,
      role: decoded.role || null,
    };
  } catch {
    return { type: 'invalid_token', name: null, email: null, id: null };
  }
}

/* ── Public API ──────────────────────────────────────────────────────────── */

export function isTrackingEnabled() {
  return trackingEnabled;
}

export function enableTracking() {
  trackingEnabled = true;
  saveTrackingConfig();
  startFlushTimer();
  return { enabled: true, message: 'Request tracking enabled' };
}

export function disableTracking() {
  trackingEnabled = false;
  saveTrackingConfig();
  flushLogsToFile();
  stopFlushTimer();
  return { enabled: false, message: 'Request tracking disabled' };
}

export function getTrackingStatus() {
  return {
    enabled: trackingEnabled,
    logsCount: requestLogs.length,
    logFile: trackingEnabled ? getLogsFilePath() : null,
    configFile: getConfigPath(),
  };
}

export function getLogs({ limit = 100, offset = 0, method, statusCode, identityType, search, today } = {}) {
  let filtered = [...requestLogs];

  if (today) {
    const todayStr = new Date().toDateString();
    filtered = filtered.filter(l => new Date(l.timestamp).toDateString() === todayStr);
  }
  if (method) {
    filtered = filtered.filter(l => l.method.toUpperCase() === method.toUpperCase());
  }
  if (statusCode) {
    filtered = filtered.filter(l => l.statusCode === Number(statusCode));
  }
  if (identityType) {
    filtered = filtered.filter(l => l.identity.type === identityType);
  }
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(l =>
      l.url.toLowerCase().includes(q) ||
      (l.identity.name || '').toLowerCase().includes(q) ||
      (l.identity.email || '').toLowerCase().includes(q) ||
      (l.identity.indexNumber || '').toLowerCase().includes(q) ||
      l.ip.includes(q) ||
      l.browser.toLowerCase().includes(q)
    );
  }

  const total = filtered.length;
  const paginated = filtered.reverse().slice(offset, offset + limit);

  return { logs: paginated, total, limit, offset };
}

export function getLogStats() {
  const total = requestLogs.length;
  if (total === 0) {
    return { total: 0, byMethod: {}, byStatus: {}, byIdentity: {}, byBrowser: {}, byOS: {}, byDevice: {}, avgDuration: 0, uniqueIPs: 0 };
  }

  const byMethod = {};
  const byStatus = {};
  const byIdentity = {};
  const byBrowser = {};
  const byOS = {};
  const byDevice = {};
  const uniqueIPs = new Set();
  let totalDuration = 0;

  for (const log of requestLogs) {
    byMethod[log.method] = (byMethod[log.method] || 0) + 1;
    byStatus[log.statusCode] = (byStatus[log.statusCode] || 0) + 1;
    byIdentity[log.identity.type] = (byIdentity[log.identity.type] || 0) + 1;
    byBrowser[log.browser] = (byBrowser[log.browser] || 0) + 1;
    byOS[log.os] = (byOS[log.os] || 0) + 1;
    byDevice[log.device] = (byDevice[log.device] || 0) + 1;
    uniqueIPs.add(log.ip);
    totalDuration += log.durationMs;
  }

  return {
    total,
    byMethod,
    byStatus,
    byIdentity,
    byBrowser,
    byOS,
    byDevice,
    avgDuration: Math.round(totalDuration / total),
    uniqueIPs: uniqueIPs.size,
  };
}

export function clearLogs() {
  flushLogsToFile(); // save current before clearing
  requestLogs = [];
  flushLogsToFile(); // overwrite file with empty
  return { message: 'All logs cleared' };
}

/* ── Middleware ───────────────────────────────────────────────────────────── */

export function requestLogger(req, res, next) {
  // Skip if tracking is not enabled
  if (!trackingEnabled) {
    return next();
  }

  // Skip logging the activity endpoints themselves
  if (req.url?.startsWith('/api/developer')) {
    return next();
  }

  const startTime = Date.now();
  const { browser, os, device } = parseUserAgent(req.headers['user-agent']);

  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - startTime;
    const identity = extractIdentity(req);

    const log = {
      id: requestLogs.length + 1,
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      durationMs: duration,
      identity,
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || req.ip,
      userAgent: req.headers['user-agent'] || 'Unknown',
      browser,
      os,
      device,
      contentType: req.headers['content-type'] || null,
      referer: req.headers['referer'] || null,
      origin: req.headers['origin'] || null,
    };

    requestLogs.push(log);
    if (requestLogs.length > MAX_LOGS) {
      requestLogs.shift();
    }

    originalEnd.apply(this, args);
  };

  next();
}

/* ── Initialization (called on server boot) ──────────────────────────────── */

export function initRequestLogger() {
  loadTrackingConfig();
  if (trackingEnabled) {
    loadExistingLogs();
    startFlushTimer();
    console.log(`[RequestLogger] Tracking is ENABLED (${requestLogs.length} existing logs loaded)`);
  } else {
    console.log('[RequestLogger] Tracking is DISABLED (developer must enable via API)');
  }
}

export function shutdownRequestLogger() {
  flushLogsToFile();
  stopFlushTimer();
}
