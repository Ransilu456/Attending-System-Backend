#!/usr/bin/env node

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import {
  logInfo, logError, logSection, logBox, logProgress,
  startSpinner, succeedSpinner, failSpinner,
} from '../terminal.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI;
const BACKUP_DIR = path.join(__dirname, 'backups');

// Perform full MongoDB JSON backup to disk
async function backup() {
  logSection('Database Backup');

  if (!MONGODB_URI) {
    logError('MONGODB_URI is not defined in .env');
    process.exit(1);
  }

  const spinId = 'connect';
  startSpinner(spinId, 'Connecting to MongoDB');
  try {
    await mongoose.connect(MONGODB_URI);
    succeedSpinner(spinId, 'Connected');
  } catch (err) {
    failSpinner(spinId, 'Connection failed');
    logError(err.message);
    process.exit(1);
  }

  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      logInfo(`Created backup directory: ${chalk.gray(BACKUP_DIR)}`);
    }

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    logInfo(`Found ${chalk.bold(collections.length)} collections to backup\n`);

    let totalDocs = 0;
    for (let i = 0; i < collections.length; i++) {
      const collectionInfo = collections[i];
      const collectionName = collectionInfo.name;

      const collSpin = `backup-${collectionName}`;
      startSpinner(collSpin, `Backing up: ${collectionName}`);

      const data = await db.collection(collectionName).find({}).toArray();
      const filePath = path.join(BACKUP_DIR, `${collectionName}.json`);

      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      succeedSpinner(collSpin, `${chalk.bold(collectionName)}: ${chalk.yellow(data.length)} docs → ${chalk.gray(collectionName + '.json')}`);

      totalDocs += data.length;
      logProgress(i + 1, collections.length, 'Progress');
    }

    console.log('');
    logBox('Backup Complete', [
      `Collections: ${chalk.bold(collections.length)}`,
      `Total docs:  ${chalk.bold(totalDocs)}`,
      `Location:    ${chalk.cyan(BACKUP_DIR)}`,
    ].join('\n'));

  } catch (error) {
    logError('Backup failed', error);
  } finally {
    await mongoose.disconnect();
    logInfo('Disconnected from MongoDB');
  }
}

backup();
