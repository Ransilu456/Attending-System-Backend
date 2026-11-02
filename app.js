import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';

import studentRoutes from './routes/students.routes.js';
import adminRoutes from './routes/admin.routes.js';
import qrScannerRoutes from './routes/qrScanner.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import { generateCsrfToken, validateCsrf } from './middleware/csrfMiddleware.js';
import { validateInputPayload } from './utils/inputValidation.js';
import { errorHandler } from './middleware/authMiddleware.js';
import { logWarning } from './utils/logging/terminal.js';

export const createApp = () => {
  const app = express();
  app.disable('x-powered-by');

  const allowedOrigins = [
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'http://localhost:4173', 'http://127.0.0.1:4173',
    'http://localhost:3000', 'http://127.0.0.1:3000',
    process.env.CLIENT_URL,
  ].filter(Boolean);

  app.use(cors({
    origin: (origin, callback) => allowedOrigins.includes(origin) || !origin
      ? callback(null, true)
      : callback(new Error('Blocked by CORS policy')),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token', 'x-session-id', 'mongodb-date-format', 'preserve-mongodb-format', 'time-format', 'Accept'],
    exposedHeaders: ['Content-Disposition', 'Retry-After', 'RateLimit-Reset', 'RateLimit-Remaining', 'RateLimit-Limit'],
    credentials: true,
  }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  app.use('/api/', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { status: 'fail', message: 'Too many requests from this IP. Please try again later.' },
  }));
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

  app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({ success: false, message: 'Malformed JSON payload' });
    }
    next(error);
  });

  app.use((req, res, next) => {
    const errors = [
      ...validateInputPayload(req.body, 'body'),
      ...validateInputPayload(req.query, 'query'),
      ...validateInputPayload(req.params, 'params'),
    ];
    if (errors.length) return res.status(400).json({ success: false, code: 'STU-INPUT-001', message: 'Request contains unsupported input.', errors });
    next();
  });

  app.get(['/api/v1/csrf-token', '/api/csrf-token'], generateCsrfToken);
  app.use('/api/', validateCsrf);

  for (const prefix of ['/api/v1', '/api']) {
    app.use(`${prefix}/students`, studentRoutes);
    app.use(`${prefix}/admin`, adminRoutes);
    app.use(`${prefix}/qr`, qrScannerRoutes);
    app.use(`${prefix}/attendance`, attendanceRoutes);
  }

  app.get(['/api/v1/health', '/api/health'], (req, res) => {
    res.status(200).json({
      status: 'ok', timestamp: new Date().toISOString(),
      services: { database: { status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', connection: mongoose.connection.host || 'unknown' } },
      environment: process.env.NODE_ENV || 'development', version: '1.0.0',
    });
  });
  app.get(['/api/v1/ready', '/api/ready'], (req, res) => mongoose.connection.readyState === 1
    ? res.status(200).json({ ready: true })
    : res.status(503).json({ ready: false, message: 'Database connecting…' }));

  app.use((req, res) => {
    logWarning(`Route not found: ${req.method} [path redacted]`);
    res.status(404).json({ success: false, message: 'Route not found' });
  });
  app.use(errorHandler);
  return app;
};

export default createApp;
