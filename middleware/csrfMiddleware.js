import crypto from 'crypto';
import mongoose from 'mongoose';
import CsrfToken from '../models/csrfToken.model.js';
import { logWarning } from '../utils/terminal.js';
import { isMongoUnavailable } from '../utils/dbAvailability.js';

// In-memory blocked IPs: { ip -> unblockAt }
const blockedIPs = new Map();
const inMemoryTokens = new Map();
const CSRF_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return forwarded ? forwarded.split(',')[0].trim() : req.ip || req.connection?.remoteAddress;
}

// Issue a new CSRF token and persist it in the database
export const generateCsrfToken = async (req, res, next) => {
  const token = crypto.randomBytes(32).toString('hex');
  const sessionId = req.headers['x-session-id'] || crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  for (const [storedToken, record] of inMemoryTokens) {
    if (record.expiresAt < now) inMemoryTokens.delete(storedToken);
  }

  try {
    if (mongoose.connection.readyState === 1) {
      await CsrfToken.create({ token, sessionId });
    } else {
      inMemoryTokens.set(token, { sessionId, expiresAt: now + CSRF_TOKEN_TTL_MS });
    }
  } catch (error) {
    if (!isMongoUnavailable(error)) return next(error);
    logWarning('MongoDB unavailable; issuing an in-memory CSRF token for API fallback requests.');
    inMemoryTokens.set(token, { sessionId, expiresAt: now + CSRF_TOKEN_TTL_MS });
  }

  return res.status(200).json({ csrfToken: token, sessionId });
};

// Validate incoming CSRF token against database record
export const validateCsrf = async (req, res, next) => {
  const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (safeMethod) return next();

  const ip = getClientIp(req);
  const now = Date.now();

  // Check if IP is temporarily blocked
  if (blockedIPs.has(ip)) {
    const unblockAt = blockedIPs.get(ip);
    if (now < unblockAt) {
      const secondsLeft = Math.ceil((unblockAt - now) / 1000);
      logWarning(`Blocked request from IP [REDACTED] — ${secondsLeft} seconds remaining`);
      return res.status(403).json({
        success: false,
        message: `Too many invalid requests. Try again in ${secondsLeft} seconds.`
      });
    }
    blockedIPs.delete(ip);
  }

  const token = req.headers['x-csrf-token'];

  if (!token) {
    blockedIPs.set(ip, now + 2 * 60 * 1000);
    return res.status(403).json({ success: false, message: 'CSRF token missing.' });
  }

  const inMemoryRecord = inMemoryTokens.get(token);
  if (inMemoryRecord) {
    if (
      inMemoryRecord.expiresAt >= now &&
      inMemoryRecord.sessionId === req.headers['x-session-id']
    ) {
      req.csrfSessionId = inMemoryRecord.sessionId;
      return next();
    }
    inMemoryTokens.delete(token);
  }

  try {
    const record = await CsrfToken.findOne({ token });
    if (!record || record.expiresAt < new Date()) {
      blockedIPs.set(ip, now + 2 * 60 * 1000);
      if (record) await CsrfToken.deleteOne({ token });
      return res.status(403).json({ success: false, message: 'Invalid or expired CSRF token.' });
    }

    req.csrfSessionId = record.sessionId;
    next();
  } catch (error) {
    if (isMongoUnavailable(error)) {
      return res.status(503).json({ success: false, message: 'MongoDB is unavailable.' });
    }
    next(error);
  }
};
