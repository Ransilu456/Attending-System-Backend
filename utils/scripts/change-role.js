#!/usr/bin/env node

import readline from 'readline';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import chalk from 'chalk';
import {
  logInfo, logSuccess, logError, logWarning, logBox,
  startSpinner, succeedSpinner, failSpinner,
} from '../terminal.js';
import Admin from '../../models/admin.model.js';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

const VALID_ROLES = ['admin', 'superadmin'];

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

// Prompt helper for CLI inputs
function prompt(question) {
  return new Promise(resolve => rl.question(chalk.gray(question), resolve));
}

// Masked input helper for sensitive fields
function promptHidden(question) {
  return new Promise(resolve => {
    if (!process.stdin.isTTY) {
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
        if (ch === '\u0003') process.exit();
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

// Teardown CLI stream and database connection
function cleanup() {
  rl.close();
  mongoose.disconnect().catch(() => {});
}

const ROLE_META = {
  admin:      { icon: '🛡️ ', color: chalk.blue,   desc: 'Manage students & attendance' },
  superadmin: { icon: '👑 ', color: chalk.magenta, desc: 'All admin capabilities + manage admins' },
};

function roleLabel(role) {
  const meta = ROLE_META[role] || { icon: '  ', color: chalk.white, desc: role };
  return `${meta.icon} ${meta.color(role.padEnd(10))} ${chalk.gray(meta.desc)}`;
}

// Main execution routine
async function main() {
  const cols = Math.min(process.stdout.columns || 80, 90);
  console.log();
  console.log(chalk.bold.magenta('  ' + '═'.repeat(cols - 2)));
  console.log(`  ${chalk.bold.white('DP Attendance')}  ${chalk.gray('·')}  ${chalk.magenta('Change Admin Role')}`);
  console.log(chalk.bold.magenta('  ' + '═'.repeat(cols - 2)));
  console.log();
  logInfo('You must verify the account\'s password to proceed.');
  console.log();

  const mongoURI = process.env.MONGODB_URI;
  if (!mongoURI) {
    logError('MONGODB_URI not found. Add it to .env in the project root.');
    process.exit(1);
  }

  const dbSpin = 'mongo';
  startSpinner(dbSpin, 'Connecting to MongoDB');
  try {
    await mongoose.connect(mongoURI);
    succeedSpinner(dbSpin, 'Connected to MongoDB');
  } catch (err) {
    failSpinner(dbSpin, 'Connection failed');
    logError(err.message);
    process.exit(1);
  }

  const email = (await prompt('  Admin email   : ')).trim().toLowerCase();
  if (!email) { logError('Email is required.'); cleanup(); process.exit(1); }

  const findSpin = 'find';
  startSpinner(findSpin, 'Looking up account');
  const admin = await Admin.findOne({ email }).select('+password');
  if (!admin) {
    failSpinner(findSpin, 'Account not found');
    logError(`No account found with email: ${email}`);
    cleanup(); process.exit(1);
  }
  succeedSpinner(findSpin, 'Account found');

  logBox('Account Found', [
    `Name  : ${chalk.bold.white(admin.name)}`,
    `Email : ${chalk.cyan(admin.email)}`,
    `Role  : ${roleLabel(admin.role)}`,
    `ID    : ${chalk.gray(admin._id)}`,
  ].join('\n'));

  const password = (await promptHidden('  Password      : ')).trim();
  if (!password) { logError('Password is required.'); cleanup(); process.exit(1); }

  const verifySpin = 'verify';
  startSpinner(verifySpin, 'Verifying password');
  const isMatch = await admin.matchPassword(password);
  if (!isMatch) {
    failSpinner(verifySpin, 'Incorrect password');
    logError('Identity verification failed. Role not changed.');
    cleanup(); process.exit(1);
  }
  succeedSpinner(verifySpin, 'Password verified');

  console.log();
  console.log(`  ${chalk.bold('Available roles:')}`);
  VALID_ROLES.forEach((r, i) => {
    console.log(`    ${chalk.yellow(`${i + 1}.`)} ${roleLabel(r)}`);
  });
  console.log();

  const choice = (await prompt('  New role (1/2 or name): ')).trim();
  let newRole;

  if (choice === '1')                   newRole = 'admin';
  else if (choice === '2')              newRole = 'superadmin';
  else if (VALID_ROLES.includes(choice)) newRole = choice;
  else {
    logError(`Invalid choice: "${choice}". Options: ${VALID_ROLES.join(', ')}`);
    cleanup(); process.exit(1);
  }

  if (newRole === admin.role) {
    logWarning(`Account already has role "${newRole}" — no changes made.`);
    cleanup(); process.exit(0);
  }

  console.log();
  const arrow = chalk.gray('→');
  const confirmMsg = `  Confirm: ${chalk.bold(admin.name)} ${chalk.red(admin.role)} ${arrow} ${chalk.green(newRole)} (yes/no): `;
  const conf = (await prompt(confirmMsg)).trim().toLowerCase();

  if (conf !== 'yes') {
    logWarning('Cancelled — no changes made.');
    cleanup(); process.exit(0);
  }

  const updateSpin = 'update';
  startSpinner(updateSpin, 'Updating role');
  const oldRole = admin.role;
  admin.role = newRole;
  await admin.save();
  succeedSpinner(updateSpin, 'Role updated successfully');

  logBox('Role Changed', [
    `Account : ${chalk.bold.white(admin.name)} (${chalk.gray(admin.email)})`,
    `Change  : ${chalk.red(oldRole)} ${chalk.gray('→')} ${chalk.green(newRole)}`,
  ].join('\n'));

  cleanup();
  console.log();
  logSuccess('Done!');
}

main().catch(err => {
  logError(err.message);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
