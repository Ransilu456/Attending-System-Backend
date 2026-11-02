import dotenv from 'dotenv';
dotenv.config();

import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from '../app.js';
import { connectDB, closeDB } from '../config/database.js';
import { startScheduler, stopScheduler } from '../services/schedulerService.js';
import { startStudentFirebase, reconcileStudentFirebase, stopStudentFirebase } from './studentFirebase.js';
import { logError, logInfo, logSuccess, logWarning, printBanner, logServerStart } from '../utils/logging/terminal.js';

const app = createApp();
let server;
let schedulerStarted = false;

const connectMongoInBackground = () => {
  if (!process.env.MONGODB_URI) {
    logWarning('MONGO_DB URI is not configured. MongoDB-backed operations will be unavailable.');
    return;
  }

  const connect = async () => {
    try {
      await connectDB();
      if (!schedulerStarted) {
        startScheduler();
        schedulerStarted = true;
      }
      await startStudentFirebase();
      void reconcileStudentFirebase();
    } catch (error) {
      logError(`MongoDB connection failed: ${error.message}`);
      const retry = setTimeout(connect, 30000);
      retry.unref();
    }
  };
  void connect();
};

export const startServer = async ({
  port = Number(process.env.PORT || 5001),
  host = process.env.HOST || '127.0.0.1',
} = {}) => {
  printBanner();
  await new Promise((resolve, reject) => {
    server = app.listen(port, host, () => {
      logServerStart(port);
      resolve();
    });
    server.once('error', reject);
  });
  logInfo(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logSuccess(`Server is running in ${process.env.NODE_ENV || 'development'} mode`);
  connectMongoInBackground();
  return { app, server, port, host };
};

export const shutdown = async (signal = 'shutdown') => {
  logWarning(`Received ${signal} signal. Shutting down gracefully...`);
  await stopScheduler();
  await stopStudentFirebase();
  await closeDB().catch((error) => logError(`Database close failed: ${error.message}`));
  if (server?.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
};

const isDirectEntry = process.argv[1]
  && pathToFileURL(fileURLToPath(new URL(import.meta.url))).href === pathToFileURL(process.argv[1]).href;

if (isDirectEntry) {
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
  startServer().catch((error) => {
    logError(`Server failed to start: ${error.message}`);
    process.exitCode = 1;
  });
}
