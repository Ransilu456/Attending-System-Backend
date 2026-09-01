import express from 'express';
import jwt from 'jsonwebtoken';
import Admin from '../models/admin.model.js';
import {
  enableTracking,
  disableTracking,
  getTrackingStatus,
  getLogs,
  getLogStats,
  clearLogs,
  isTrackingEnabled,
} from '../middleware/requestLogger.js';

const router = express.Router();

/* ─────────────────────────────────────────────────────────────────────────── */
/* Middleware: verifyDeveloper — checks JWT + role === 'developer'             */
/* ─────────────────────────────────────────────────────────────────────────── */

const verifyDeveloper = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ message: 'Not authenticated. Provide a valid token.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== 'developer') {
      return res.status(403).json({ message: 'Developer access required.' });
    }

    const admin = await Admin.findById(decoded.id);
    if (!admin) {
      return res.status(401).json({ message: 'Account no longer exists.' });
    }

    if (admin.status === 'inactive') {
      return res.status(401).json({ message: 'Account is inactive.' });
    }

    req.developer = admin;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired. Please login again.' });
    }
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────────────────── */
/* Auth Routes                                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

// POST /api/developer/login — developer login (same as admin login but checks role)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const admin = await Admin.findOne({ email }).select('+password');
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    if (admin.role !== 'developer') {
      return res.status(403).json({ message: 'This account is not a developer account.' });
    }

    if (!admin.isActive) {
      return res.status(401).json({ message: 'Account is inactive.' });
    }

    const isMatch = await admin.matchPassword(password);
    if (!isMatch) {
      admin.failedLoginAttempts = (admin.failedLoginAttempts || 0) + 1;
      if (admin.failedLoginAttempts >= 5) {
        admin.accountLockedUntil = Date.now() + 30 * 60 * 1000;
      }
      await admin.save();
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Check account lock
    if (admin.accountLockedUntil && admin.accountLockedUntil > Date.now()) {
      return res.status(401).json({ message: 'Account is locked. Try again later.' });
    }

    // Success
    admin.failedLoginAttempts = 0;
    admin.accountLockedUntil = undefined;
    admin.lastLogin = Date.now();
    await admin.save();

    const token = jwt.sign(
      { id: admin._id, role: 'developer', email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      message: 'Developer login successful',
      token,
      developer: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error('Developer login error:', error);
    res.status(500).json({ message: 'Login error.', error: error.message });
  }
});

/* ─────────────────────────────────────────────────────────────────────────── */
/* Tracking Control Routes (developer only)                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

// GET /api/developer/tracking/status — check if tracking is on/off
router.get('/tracking/status', verifyDeveloper, (req, res) => {
  res.status(200).json(getTrackingStatus());
});

// POST /api/developer/tracking/enable — start tracking
router.post('/tracking/enable', verifyDeveloper, (req, res) => {
  const result = enableTracking();
  res.status(200).json(result);
});

// POST /api/developer/tracking/disable — stop tracking
router.post('/tracking/disable', verifyDeveloper, (req, res) => {
  const result = disableTracking();
  res.status(200).json(result);
});

/* ─────────────────────────────────────────────────────────────────────────── */
/* Log Routes (developer only)                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

// GET /api/developer/logs — get logs (with filters)
router.get('/logs', verifyDeveloper, (req, res) => {
  if (!isTrackingEnabled()) {
    return res.status(400).json({ message: 'Tracking is not enabled. Enable it first: POST /api/developer/tracking/enable' });
  }
  const { limit, offset, method, statusCode, identityType, search, today } = req.query;
  const result = getLogs({
    limit: limit ? Number(limit) : 100,
    offset: offset ? Number(offset) : 0,
    method, statusCode, identityType, search, today,
  });
  res.status(200).json(result);
});

// GET /api/developer/logs/stats — get summary stats
router.get('/logs/stats', verifyDeveloper, (req, res) => {
  if (!isTrackingEnabled()) {
    return res.status(400).json({ message: 'Tracking is not enabled.' });
  }
  res.status(200).json(getLogStats());
});

// DELETE /api/developer/logs — clear all logs
router.delete('/logs', verifyDeveloper, (req, res) => {
  const result = clearLogs();
  res.status(200).json(result);
});

/* ─────────────────────────────────────────────────────────────────────────── */
/* Developer Management Routes (developer only)                                */
/* ─────────────────────────────────────────────────────────────────────────── */

// GET /api/developer/developers — list all developer accounts
router.get('/developers', verifyDeveloper, async (req, res) => {
  try {
    const developers = await Admin.find({ role: 'developer' })
      .select('name email role isActive lastLogin createdAt')
      .sort({ createdAt: -1 });

    res.status(200).json({
      count: developers.length,
      developers,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching developers.', error: error.message });
  }
});

// POST /api/developer/create — create a new developer account
router.post('/create', verifyDeveloper, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
    }

    if (!/\d/.test(password) || !/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
      return res.status(400).json({ message: 'Password must contain at least one number, one lowercase letter, and one uppercase letter.' });
    }

    const existing = await Admin.findOne({ email: email.trim().toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const newDeveloper = await Admin.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: 'developer',
      isActive: true,
    });

    res.status(201).json({
      message: 'Developer account created successfully',
      developer: {
        _id: newDeveloper._id,
        name: newDeveloper.name,
        email: newDeveloper.email,
        role: newDeveloper.role,
        createdAt: newDeveloper.createdAt,
      },
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ message: messages.join('. ') });
    }
    res.status(500).json({ message: 'Error creating developer.', error: error.message });
  }
});

// DELETE /api/developer/developers/:id — deactivate a developer account
router.delete('/developers/:id', verifyDeveloper, async (req, res) => {
  try {
    const target = await Admin.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ message: 'Developer not found.' });
    }

    if (target.role !== 'developer') {
      return res.status(400).json({ message: 'This account is not a developer.' });
    }

    if (target._id.toString() === req.developer._id.toString()) {
      return res.status(400).json({ message: 'You cannot deactivate your own account.' });
    }

    target.isActive = false;
    await target.save();

    res.status(200).json({ message: `Developer ${target.name} has been deactivated.` });
  } catch (error) {
    res.status(500).json({ message: 'Error deactivating developer.', error: error.message });
  }
});

// POST /api/developer/developers/:id/reactivate — reactivate a developer account
router.post('/developers/:id/reactivate', verifyDeveloper, async (req, res) => {
  try {
    const target = await Admin.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ message: 'Developer not found.' });
    }

    if (target.role !== 'developer') {
      return res.status(400).json({ message: 'This account is not a developer.' });
    }

    target.isActive = true;
    target.failedLoginAttempts = 0;
    target.accountLockedUntil = undefined;
    await target.save();

    res.status(200).json({ message: `Developer ${target.name} has been reactivated.` });
  } catch (error) {
    res.status(500).json({ message: 'Error reactivating developer.', error: error.message });
  }
});

/* ─────────────────────────────────────────────────────────────────────────── */
/* System Info (developer only)                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

// GET /api/developer/system — quick system overview
router.get('/system', verifyDeveloper, async (req, res) => {
  try {
    const mongoose = await import('mongoose');
    const Student = (await import('../models/student.model.js')).default;

    const studentCount = await Student.countDocuments();
    const adminCount = await Admin.countDocuments();
    const developerCount = await Admin.countDocuments({ role: 'developer' });

    res.status(200).json({
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      env: process.env.NODE_ENV || 'development',
      db: {
        status: mongoose.default.connection.readyState === 1 ? 'connected' : 'disconnected',
        host: mongoose.default.connection.host,
      },
      counts: {
        students: studentCount,
        admins: adminCount,
        developers: developerCount,
      },
      tracking: getTrackingStatus(),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching system info.', error: error.message });
  }
});

export default router;
