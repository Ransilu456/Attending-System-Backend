#!/usr/bin/env node

/**
 * DP Attendance — Create Developer Account
 * ─────────────────────────────────────────
 * Connects directly to MongoDB. No API login required.
 * Use this to bootstrap the very first developer account.
 *
 * Usage:
 *   node utils/scripts/create-developer.js
 *
 * Environment:
 *   MONGODB_URI — MongoDB connection string (read from .env automatically)
 */

import readline from 'readline';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import chalk from 'chalk';
import {
  logInfo, logSuccess, logError, logWarning, logSection, logBox,
  startSpinner, succeedSpinner, failSpinner,
} from '../terminal.js';
import Admin from '../../models/admin.model.js';

// Load .env from the project root (two levels up from this script)
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

/* ─── Readline ────────────────────────────────────────────────────────────── */

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

function prompt(question) {
  return new Promise(resolve => rl.question(chalk.gray(question), resolve));
}

function promptHidden(question) {
  return new Promise(resolve => {
    if (!process.stdin.isTTY) {
      // Non-interactive, fall back to normal prompt
      rl.question(chalk.gray(question), resolve);
      return;
    }
    process.stdout.write(chalk.gray(question));
    let value = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onData = (ch) => {
      if (ch === '\n' || ch === '\r' || ch === '\u0003') {
        if (ch === '\u0003') { process.exit(); }
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(value);
      } else if (ch === '\u007f') {
        if (value.length > 0) { value = value.slice(0, -1); process.stdout.write('\b \b'); }
      } else {
        value += ch;
        process.stdout.write('*');
      }
    };
    process.stdin.on('data', onData);
  });
}

function cleanup() {
  rl.close();
  mongoose.disconnect().catch(() => {});
}

/* ─── Validation ──────────────────────────────────────────────────────────── */

function validatePassword(pw) {
  if (pw.length < 8)            return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(pw))        return 'Password needs at least one uppercase letter.';
  if (!/[a-z]/.test(pw))        return 'Password needs at least one lowercase letter.';
  if (!/\d/.test(pw))           return 'Password needs at least one number.';
  return null;
}

/* ─── Main ────────────────────────────────────────────────────────────────── */

async function main() {
  // ─── Header ───────────────────────────────────────────────────────────────
  const cols = Math.min(process.stdout.columns || 80, 90);
  console.log();
  console.log(chalk.bold.blue('  ' + '═'.repeat(cols - 2)));
  console.log(`  ${chalk.bold.white('DP Attendance')}  ${chalk.gray('·')}  ${chalk.cyan('Create Developer Account')}`);
  console.log(chalk.bold.blue('  ' + '═'.repeat(cols - 2)));
  console.log();
  logInfo('This creates a developer account directly in MongoDB.');
  logInfo('Use the resulting credentials to log in via the CLI or API.');
  console.log();

  // ─── Database ─────────────────────────────────────────────────────────────
  const mongoURI = process.env.MONGODB_URI;
  if (!mongoURI) {
    logError('MONGODB_URI not found. Add it to .env in the project root.');
    process.exit(1);
  }

  const dbSpin = 'mongo';
  startSpinner(dbSpin, 'Connecting to MongoDB');
  try {
    await mongoose.connect(mongoURI);
    succeedSpinner(dbSpin, `Connected — ${chalk.gray(mongoURI.replace(/\/\/[^:]+:[^@]+@/, '//****:****@'))}`);
  } catch (err) {
    failSpinner(dbSpin, 'Connection failed');
    logError(err.message);
    process.exit(1);
  }

  // ─── Name ─────────────────────────────────────────────────────────────────
  const name = (await prompt('  Full name     : ')).trim();
  if (!name) { logError('Name is required.'); cleanup(); process.exit(1); }

  // ─── Email ────────────────────────────────────────────────────────────────
  const email = (await prompt('  Email address : ')).trim().toLowerCase();
  if (!email) { logError('Email is required.'); cleanup(); process.exit(1); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    logError('Invalid email address.'); cleanup(); process.exit(1);
  }

  const checkSpin = 'check';
  startSpinner(checkSpin, 'Checking email');
  const existing = await Admin.findOne({ email });
  if (existing) {
    failSpinner(checkSpin, 'Email taken');
    logError(`An account with "${email}" already exists (role: ${existing.role}).`);
    cleanup(); process.exit(1);
  }
  succeedSpinner(checkSpin, `${chalk.green('Available')} — ${email}`);

  // ─── Password ─────────────────────────────────────────────────────────────
  const password = (await promptHidden('  Password      : ')).trim();
  const pwErr = validatePassword(password);
  if (pwErr) { logError(pwErr); cleanup(); process.exit(1); }

  const confirm = (await promptHidden('  Confirm pass  : ')).trim();
  if (confirm !== password) { logError('Passwords do not match.'); cleanup(); process.exit(1); }

  // ─── Create ───────────────────────────────────────────────────────────────
  console.log();
  const createSpin = 'create';
  startSpinner(createSpin, 'Creating developer account');
  const dev = await Admin.create({
    name,
    email,
    password,
    role: 'developer',
    isActive: true,
  });
  succeedSpinner(createSpin, 'Account created successfully');

  logBox('New Developer Account', [
    `Name    : ${chalk.bold.white(dev.name)}`,
    `Email   : ${chalk.cyan(dev.email)}`,
    `Role    : ${chalk.green(dev.role)}`,
    `ID      : ${chalk.gray(dev._id)}`,
    `Created : ${chalk.gray(new Date(dev.createdAt).toLocaleString())}`,
    '',
    chalk.bold('Next steps:'),
    `  ${chalk.gray('•')} ${chalk.cyan('node utils/scripts/dev-cli.js')}  then  ${chalk.cyan('login')}`,
    `  ${chalk.gray('•')} ${chalk.cyan('POST /api/developer/login')}  (API)`,
  ].join('\n'));

  cleanup();
  logSuccess('Done!');
}

main().catch(err => {
  logError(err.message);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
