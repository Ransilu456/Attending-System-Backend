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
import notificationRoutes from './routes/notifications.routes.js';

import { startScheduler } from './services/schedulerService.js';
import { errorHandler } from './middleware/authMiddleware.js';
import { printBanner, logInfo, logSuccess, logWarning, logError, logSection, logServerStart, stopSpinner, succeedSpinner } from './utils/terminal.js';
import { connectDB, closeDB } from './config/database.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

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

// Request and response logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logMessage = `${req.method} ${req.originalUrl || req.url} ${res.statusCode} (${duration}ms)`;
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

// API route registrations
app.use('/api/students', studentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/qr', qrScannerRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/public', express.static('public'));

// Server health check endpoint
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      database: {
        status: dbStatus,
        connection: mongoose.connection.host || 'unknown'
      },
    },
    environment: process.env.NODE_ENV || 'development',
    version: '8.1.0'
  });
});

// 404 Route handler for undefined endpoints
app.use((req, res) => {
  logWarning(`Route not found: ${req.method} ${req.url}`);
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.url
  });
});

// Centralized error handling middleware
app.use(errorHandler);

// Server startup and initialization sequence
const startServer = async () => {
  let server;
  try {
    printBanner();

    if (!process.env.MONGODB_URI) {
      logError('Missing MONGODB_URI environment variable. Please check your .env file.');
      process.exit(1);
    }

    logSection('Configuration');
    logInfo(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logInfo(`Port: ${port}`);
    logInfo(`CORS Origins: ${allowedOrigins.join(', ')}`);

    logSection('Database');
    await connectDB();
    succeedSpinner('db', 'Connected to MongoDB successfully');

    logSection('API Routes');
    logInfo('GET  /api/health - Health check endpoint');
    logInfo('POST /api/qr/markAttendanceQR - QR code attendance marking');
    logInfo('GET  /api/students/download-qr-code - Download student QR code');

    server = app.listen(port, '0.0.0.0', () => {
      stopSpinner('server');
      logServerStart(port);
      logSuccess(`Server is running in ${process.env.NODE_ENV || 'development'} mode`);
    });

    startScheduler();

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

      function closeDBAndExit() {
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
