import crypto from 'crypto';
import CsrfToken from '../models/csrfToken.model.js';
import { logWarning } from '../utils/terminal.js';

// In-memory blocked IPs: { ip -> unblockAt }
const blockedIPs = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return forwarded ? forwarded.split(',')[0].trim() : req.ip || req.connection?.remoteAddress;
}

// Issue a new CSRF token and persist it in the database
export const generateCsrfToken = async (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');
  const sessionId = req.headers['x-session-id'] || crypto.randomBytes(16).toString('hex');

  await CsrfToken.create({ token, sessionId });

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

  const record = await CsrfToken.findOne({ token });
  if (!record || record.expiresAt < new Date()) {
    blockedIPs.set(ip, now + 2 * 60 * 1000);
    if (record) await CsrfToken.deleteOne({ token });
    return res.status(403).json({ success: false, message: 'Invalid or expired CSRF token.' });
  }

  // Token is valid — attach session id for downstream use
  req.csrfSessionId = record.sessionId;
  next();
};
