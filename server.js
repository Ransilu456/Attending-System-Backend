import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';

import studentRoutes from './routes/students.routes.js';
import adminRoutes from './routes/admin.routes.js';
import qrScannerRoutes from './routes/qrScanner.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';

import { startScheduler, stopScheduler } from './services/schedulerService.js';
import { errorHandler } from './middleware/authMiddleware.js';
import { generateCsrfToken, validateCsrf } from './middleware/csrfMiddleware.js';
import { printBanner, logInfo, logSuccess, logWarning, logError, logSection, logServerStart, stopSpinner, succeedSpinner } from './utils/terminal.js';
import { connectDB, closeDB } from './config/database.js';
import {
  syncAllStudentsToFirebase,
  isFirebaseMirrorConfigured,
  startStudentMirror,
  stopStudentMirror,
} from './services/firebaseMirrorService.js';
import {
  syncPendingStudentProfileEdits,
  startStudentProfileEditSync,
  stopStudentProfileEditSync,
} from './services/studentProfileEditSyncService.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;
let firebaseConfigured = false;
let firebaseReconciliationStarted = false;
let firebaseReconciliationTimer;

// Disable Express fingerprint header
app.disable('x-powered-by');

// Trusted CORS origins list
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.CLIENT_URL
].filter(Boolean);

// CORS cross-origin configuration
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-csrf-token',
    'x-session-id',
    'mongodb-date-format',
    'preserve-mongodb-format',
    'time-format',
    'Accept'
  ],
  exposedHeaders: ['Content-Disposition', 'Retry-After', 'RateLimit-Reset', 'RateLimit-Remaining', 'RateLimit-Limit'],
  preflightContinue: false,
  maxAge: 3600,
  optionsSuccessStatus: 200,
  credentials: true
}));

// Production security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Global API rate limiter to protect against denial-of-service
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { status: 'fail', message: 'Too many requests from this IP. Please try again later.' }
});
app.use('/api/', globalApiLimiter);

// Parse JSON and urlencoded request bodies with size limits
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Handle invalid JSON payload syntax errors cleanly
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Malformed JSON payload'
    });
  }
  next(err);
});

// Request and response logger (no user input or path params logged)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    // Log only method + base path (strip query strings and path params)
    const basePath = req.route?.path || req.path.replace(/\/[a-f0-9]{24}/gi, '/:id').replace(/\/[^/]+$/, '/*');
    const logMessage = `${req.method} ${basePath} ${res.statusCode} (${duration}ms)`;
    if (res.statusCode >= 500) {
      logError(logMessage);
    } else if (res.statusCode >= 400) {
      logWarning(logMessage);
    } else {
      logInfo(logMessage);
    }
  });
  next();
});

// CSRF token issuance endpoint (unauthenticated, GET)
app.get(['/api/v1/csrf-token', '/api/csrf-token'], generateCsrfToken);

// Apply CSRF validation to all state-changing API routes
app.use('/api/', validateCsrf);

const mountApiRoutes = (prefix) => {
  app.use(`${prefix}/students`, studentRoutes);
  app.use(`${prefix}/admin`, adminRoutes);
  app.use(`${prefix}/qr`, qrScannerRoutes);
  app.use(`${prefix}/attendance`, attendanceRoutes);
  app.use(`${prefix}/public`, express.static('public'));
};

const isFirebaseQuotaError = (error) =>
  Boolean(error) && (
    error.code === 'FIREBASE_DAILY_LIMIT' ||
    isFirebaseQuotaError(error.cause)
  );

const scheduleFirebaseReconciliation = (delay) => {
  if (firebaseReconciliationTimer) clearTimeout(firebaseReconciliationTimer);
  firebaseReconciliationTimer = setTimeout(() => {
    firebaseReconciliationTimer = undefined;
    void reconcileFirebaseOnStartup();
  }, delay);
  firebaseReconciliationTimer.unref?.();
};

const reconcileFirebaseOnStartup = async () => {
  if (firebaseReconciliationStarted) return;
  if (mongoose.connection.readyState !== 1) {
    scheduleFirebaseReconciliation(30000);
    return;
  }

  try {
    await syncPendingStudentProfileEdits();
    const result = await syncAllStudentsToFirebase({ failOnSkipped: false });
    if (result.skipped) {
      logWarning(`Startup reconciliation skipped ${result.skipped} invalid student record(s); review the errors above.`);
    }
    startStudentMirror();
    startStudentProfileEditSync();
    firebaseReconciliationStarted = true;
  } catch (error) {
    logError(`Firebase startup reconciliation failed: ${error.message}`);
    const retryDelay = isFirebaseQuotaError(error)
      ? Math.max(1000, new Date().setUTCHours(24, 0, 0, 0) - Date.now())
      : 30000;
    scheduleFirebaseReconciliation(retryDelay);
  }
};

mountApiRoutes('/api/v1');
mountApiRoutes('/api');

// Server health check endpoint
app.get(['/api/v1/health', '/api/health'], (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: { status: dbStatus, connection: mongoose.connection.host || 'unknown' },
      firebase: { status: firebaseConfigured ? 'configured' : 'not-configured' }
    },
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// Lightweight readiness check — returns 503 until DB is connected
app.get(['/api/v1/ready', '/api/ready'], (req, res) => {
  if (mongoose.connection.readyState === 1) {
    return res.status(200).json({ ready: true });
  }
  res.status(503).json({ ready: false, message: 'Database connecting…' });
});

// 404 Route handler for undefined endpoints
app.use((req, res) => {
  logWarning(`Route not found: ${req.method} [path redacted]`);
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Centralized error handling middleware
app.use(errorHandler);

// Server startup: listen immediately, connect DB in background for fast local startup
const startServer = async () => {
  let server;
  let schedulerStarted = false;
  try {
    printBanner();

    try {
      firebaseConfigured = isFirebaseMirrorConfigured();
      if (firebaseConfigured) logSuccess('Firebase Admin SDK configured');
    } catch (error) {
      logError(`Firebase configuration failed: ${error.message}`);
    }

    logSection('Configuration');
    logInfo(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logInfo(`Port: ${port}`);

    // Bind port first — server accepts connections immediately
    server = app.listen(port, '0.0.0.0', () => {
      logServerStart(port);
      logSuccess(`Server is running in ${process.env.NODE_ENV || 'development'} mode`);
    });

    // Connect to MongoDB in the background so the API can start for Firebase fallback users.
    logSection('Database');
    const connectMongo = async () => {
      try {
        await connectDB();
        succeedSpinner('db', 'Connected to MongoDB successfully');
        if (!schedulerStarted) {
          startScheduler();
          schedulerStarted = true;
        }
        if (firebaseConfigured) {
          void reconcileFirebaseOnStartup();
        }
      } catch (error) {
        logError(`MongoDB connection failed: ${error.message}`);
        if (process.env.MONGODB_URI) {
          const retry = setTimeout(connectMongo, 30000);
          retry.unref();
        }
      }
    };

    if (process.env.MONGODB_URI) {
      connectMongo();
    } else {
      logWarning('MONGODB_URI is not configured. API is available, but MongoDB-backed operations will return 503.');
    }

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logError(`Port ${port} is already in use.`);
        process.exit(1);
      } else {
        logError(`Server error: ${error.message}`);
        process.exit(1);
      }
    });

    let connections = new Set();
    server.on('connection', (connection) => {
      connections.add(connection);
      connection.on('close', () => connections.delete(connection));
    });

    // Graceful process shutdown handler
    const gracefulShutdown = (signal) => {
      logWarning(`Received ${signal} signal. Shutting down gracefully...`);

      if (!server || server.listening === false) {
        closeDBAndExit();
        return;
      }

      const forceShutdownTimeout = setTimeout(() => {
        logError('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);

      server.close(() => {
        logInfo('HTTP server closed.');
        clearTimeout(forceShutdownTimeout);

        if (connections && connections.size > 0) {
          for (const connection of connections) {
            try {
              connection.end();
            } catch {
              // Ignore cleanup close error
            }
          }
          connections.clear();
        }

        closeDBAndExit();
      });

      async function closeDBAndExit() {
        if (firebaseReconciliationTimer) clearTimeout(firebaseReconciliationTimer);
        await stopScheduler();
        await stopStudentMirror();
        await stopStudentProfileEditSync();
        if (mongoose && mongoose.connection && mongoose.connection.readyState !== 0) {
          closeDB().then(() => {
            logSuccess('Database connection closed.');
            process.exit(0);
          }).catch((err) => {
            logError(`Error closing database: ${err.message}`);
            process.exit(1);
          });
        } else {
          process.exit(0);
        }
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logError('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
