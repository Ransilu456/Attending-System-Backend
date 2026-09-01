#!/usr/bin/env node

/**
 * DP Attendance — Developer CLI
 * ─────────────────────────────
 * Interactive terminal for managing the backend in real-time.
 *
 * Usage:
 *   node utils/scripts/dev-cli.js          (interactive REPL)
 *   node utils/scripts/dev-cli.js <cmd>    (single-shot)
 *
 * Environment:
 *   API_URL — Backend base URL (default: http://localhost:5001)
 */

import readline from 'readline';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chalk from 'chalk';
import {
  logInfo, logSuccess, logError, logWarning, logSection, logBox,
  startSpinner, succeedSpinner, failSpinner,
} from '../terminal.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_URL = process.env.API_URL || 'http://localhost:5001';
let TOKEN = null;
let currentDev = null;

/* ─── Readline ────────────────────────────────────────────────────────────── */

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

function prompt(question) {
  return new Promise(resolve => rl.question(chalk.gray(question), resolve));
}

/* ─── API Client ──────────────────────────────────────────────────────────── */

async function api(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${API_URL}${path}`, opts);
    const data = await res.json();
    return { status: res.status, data };
  } catch (err) {
    throw new Error(`Network error: ${err.message}. Is the server running at ${API_URL}?`);
  }
}

/* ─── Table Printer ───────────────────────────────────────────────────────── */

function printTable(rows, columns) {
  if (!rows?.length) { logWarning('No data to display'); return; }

  const widths = {};
  for (const col of columns) {
    widths[col.key] = Math.max(col.label.length, ...rows.map(r =>
      String(r[col.key] ?? '—').substring(0, col.maxWidth || 36).length
    ));
  }

  const divider  = chalk.gray('  ' + columns.map(c => '─'.repeat(widths[c.key])).join('─┬─'));
  const header   = '  ' + columns.map(c => chalk.bold.cyan(c.label.padEnd(widths[c.key]))).join(' │ ');
  const divider2 = chalk.gray('  ' + columns.map(c => '─'.repeat(widths[c.key])).join('─┼─'));

  console.log();
  console.log(divider);
  console.log(header);
  console.log(divider2);

  for (const row of rows) {
    const cells = columns.map(c => {
      const raw = String(row[c.key] ?? '—').substring(0, c.maxWidth || 36);
      // Colour status codes
      if (c.key === 'statusCode') {
        const n = parseInt(raw);
        const coloured = n < 300 ? chalk.green(raw) : n < 400 ? chalk.yellow(raw) : chalk.red(raw);
        return coloured.padEnd(widths[c.key] + (coloured.length - raw.length));
      }
      if (c.key === 'method') {
        const m = { GET: chalk.blue, POST: chalk.green, PUT: chalk.yellow, PATCH: chalk.yellow, DELETE: chalk.red };
        const fn = m[raw] || chalk.white;
        return fn(raw).padEnd(widths[c.key] + (fn(raw).length - raw.length));
      }
      return raw.padEnd(widths[c.key]);
    });
    console.log('  ' + cells.join(' │ '));
  }

  console.log(chalk.gray('  ' + columns.map(c => '─'.repeat(widths[c.key])).join('─┴─')));
  console.log();
}

/* ─── Status Bar ──────────────────────────────────────────────────────────── */

function printStatusBar() {
  const status = TOKEN
    ? chalk.green(`● logged in as ${currentDev?.name || 'developer'}`)
    : chalk.red('○ not logged in');
  const api_str = chalk.gray(`${API_URL}`);
  process.stdout.write(chalk.gray(`\n  [${api_str}]  ${status}\n\n`));
}

/* ─── Commands ────────────────────────────────────────────────────────────── */

async function cmdLogin() {
  logSection('Login');
  const email    = await prompt('  Email    : ');
  const password = await prompt('  Password : ');

  const sid = 'login';
  startSpinner(sid, 'Authenticating');
  const { status, data } = await api('POST', '/api/developer/login', {
    email: email.trim(), password: password.trim(),
  });

  if (status === 200 && data.token) {
    TOKEN = data.token;
    currentDev = data.developer;
    succeedSpinner(sid, `Logged in as ${chalk.bold(data.developer.name)}`);
    logInfo(`Role: ${chalk.green(data.developer.role)}  ·  Email: ${chalk.cyan(data.developer.email)}`);
    logInfo(`Token: ${chalk.gray(TOKEN.substring(0, 48) + '…')}`);
  } else {
    failSpinner(sid, 'Login failed');
    logError(data.message || 'Unknown error');
  }
}

async function cmdWhoami() {
  if (!TOKEN) { logWarning('Not logged in. Run: login'); return; }
  try {
    const payload = JSON.parse(Buffer.from(TOKEN.split('.')[1], 'base64').toString());
    logBox('Current Session', [
      `Name:    ${chalk.bold(currentDev?.name || payload.name || '—')}`,
      `Email:   ${chalk.cyan(payload.email)}`,
      `Role:    ${chalk.green(payload.role)}`,
      `ID:      ${chalk.gray(payload.id)}`,
      `Expires: ${chalk.yellow(new Date(payload.exp * 1000).toLocaleString())}`,
    ].join('\n'));
  } catch { logError('Could not decode token'); }
}

async function cmdTrackingStatus() {
  const sid = 'track-status';
  startSpinner(sid, 'Fetching tracking status');
  const { status, data } = await api('GET', '/api/developer/tracking/status');
  if (status === 200) {
    succeedSpinner(sid, 'Status loaded');
    logBox('Request Tracking', [
      `Status:     ${data.enabled ? chalk.green('● ENABLED') : chalk.red('● DISABLED')}`,
      `Log count:  ${chalk.yellow(data.logsCount)}`,
      `Log file:   ${chalk.gray(data.logFile || 'N/A')}`,
      `Config:     ${chalk.gray(data.configFile)}`,
    ].join('\n'));
  } else {
    failSpinner(sid, 'Failed');
    logError(data.message);
  }
}

async function cmdTrackingEnable() {
  const sid = 'track-on';
  startSpinner(sid, 'Enabling tracking');
  const { status, data } = await api('POST', '/api/developer/tracking/enable');
  if (status === 200) { succeedSpinner(sid, 'Tracking enabled — all requests will be logged'); }
  else { failSpinner(sid, 'Failed'); logError(data.message); }
}

async function cmdTrackingDisable() {
  const sid = 'track-off';
  startSpinner(sid, 'Disabling tracking');
  const { status, data } = await api('POST', '/api/developer/tracking/disable');
  if (status === 200) { succeedSpinner(sid, 'Tracking disabled — logs saved to disk'); }
  else { failSpinner(sid, 'Failed'); logError(data.message); }
}

async function cmdLogs(args) {
  const params = new URLSearchParams();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit'    && args[i+1]) params.set('limit',        args[++i]);
    if (args[i] === '--method'   && args[i+1]) params.set('method',       args[++i]);
    if (args[i] === '--status'   && args[i+1]) params.set('statusCode',   args[++i]);
    if (args[i] === '--identity' && args[i+1]) params.set('identityType', args[++i]);
    if (args[i] === '--search'   && args[i+1]) params.set('search',       args[++i]);
    if (args[i] === '--today') params.set('today', 'true');
  }

  const qs  = params.toString();
  const sid = 'logs';
  startSpinner(sid, 'Fetching request logs');
  const { status, data } = await api('GET', `/api/developer/logs${qs ? '?' + qs : ''}`);

  if (status === 200) {
    succeedSpinner(sid, `Showing ${data.logs.length} of ${data.total} logs`);
    printTable(data.logs, [
      { key: 'id',         label: '#',        maxWidth: 5  },
      { key: 'timestamp',  label: 'Time',     maxWidth: 20 },
      { key: 'method',     label: 'Method',   maxWidth: 7  },
      { key: 'url',        label: 'URL',      maxWidth: 38 },
      { key: 'statusCode', label: 'Status',   maxWidth: 6  },
      { key: 'duration',   label: 'Dur.',     maxWidth: 8  },
      { key: 'identity',   label: 'Identity', maxWidth: 22 },
      { key: 'ip',         label: 'IP',       maxWidth: 15 },
      { key: 'browser',    label: 'Browser',  maxWidth: 18 },
      { key: 'os',         label: 'OS',       maxWidth: 16 },
    ]);
  } else {
    failSpinner(sid, 'Failed');
    logError(data.message);
  }
}

async function cmdStats() {
  const sid = 'stats';
  startSpinner(sid, 'Fetching request statistics');
  const { status, data } = await api('GET', '/api/developer/logs/stats');
  if (status === 200) {
    succeedSpinner(sid, 'Statistics loaded');

    const fmt = (obj) => Object.entries(obj || {}).map(([k, v]) =>
      `  ${chalk.cyan(k.padEnd(15))} ${chalk.yellow(String(v).padStart(6))}`
    ).join('\n');

    logBox('API Request Statistics', [
      `Total requests : ${chalk.bold.white(data.total)}`,
      `Unique IPs     : ${chalk.bold.white(data.uniqueIPs)}`,
      `Avg duration   : ${chalk.bold.white(data.avgDuration + 'ms')}`,
      '',
      chalk.bold('── By Method'),
      fmt(data.byMethod),
      '',
      chalk.bold('── By Status Code'),
      fmt(data.byStatus),
      '',
      chalk.bold('── By Identity'),
      fmt(data.byIdentity),
      '',
      chalk.bold('── By Browser'),
      fmt(data.byBrowser),
      '',
      chalk.bold('── By OS'),
      fmt(data.byOS),
    ].join('\n'));
  } else {
    failSpinner(sid, 'Failed');
    logError(data.message);
  }
}

async function cmdSystem() {
  const sid = 'system';
  startSpinner(sid, 'Fetching system info');
  const { status, data } = await api('GET', '/api/developer/system');
  if (status === 200) {
    succeedSpinner(sid, 'System info loaded');
    const dbStatus = data.db.status === 'connected'
      ? chalk.green('● connected')
      : chalk.red('● ' + data.db.status);
    const trackStatus = data.tracking.enabled
      ? chalk.green('● ENABLED')
      : chalk.red('● DISABLED');

    logBox('System Info', [
      `Node.js     : ${chalk.bold(data.nodeVersion)}`,
      `Environment : ${data.env === 'production' ? chalk.green(data.env) : chalk.yellow(data.env)}`,
      `Uptime      : ${chalk.bold(Math.round(data.uptime) + 's')}`,
      `Memory      : ${chalk.bold(Math.round(data.memory.heapUsed / 1048576) + 'MB')} used / ${Math.round(data.memory.heapTotal / 1048576) + 'MB'} total`,
      '',
      `Database    : ${dbStatus}  ${chalk.gray(data.db.host)}`,
      `Students    : ${chalk.yellow(data.counts.students)}`,
      `Admins      : ${chalk.yellow(data.counts.admins)}`,
      `Developers  : ${chalk.yellow(data.counts.developers)}`,
      '',
      `Tracking    : ${trackStatus}  (${data.tracking.logsCount} logs)`,
    ].join('\n'));
  } else {
    failSpinner(sid, 'Failed');
    logError(data.message);
  }
}

async function cmdClearLogs() {
  const confirm = await prompt('  Clear ALL logs? This cannot be undone. (yes/no): ');
  if (confirm.trim().toLowerCase() !== 'yes') { logWarning('Cancelled.'); return; }

  const sid = 'clear';
  startSpinner(sid, 'Clearing all logs');
  const { status, data } = await api('DELETE', '/api/developer/logs');
  if (status === 200) { succeedSpinner(sid, 'All request logs cleared'); }
  else { failSpinner(sid, 'Failed'); logError(data.message); }
}

async function cmdListDevelopers() {
  const sid = 'list-devs';
  startSpinner(sid, 'Fetching developer list');
  const { status, data } = await api('GET', '/api/developer/developers');
  if (status === 200) {
    succeedSpinner(sid, `${data.count} developer${data.count !== 1 ? 's' : ''} found`);
    printTable(data.developers, [
      { key: '_id',       label: 'ID',         maxWidth: 24 },
      { key: 'name',      label: 'Name',        maxWidth: 25 },
      { key: 'email',     label: 'Email',       maxWidth: 30 },
      { key: 'role',      label: 'Role',        maxWidth: 12 },
      { key: 'isActive',  label: 'Active',      maxWidth: 8  },
      { key: 'lastLogin', label: 'Last Login',  maxWidth: 22 },
    ]);
  } else {
    failSpinner(sid, 'Failed');
    logError(data.message);
  }
}

async function cmdDeactivateDeveloper(args) {
  const id = args[0];
  if (!id) { logWarning('Usage: deactivate <developer-id>'); return; }
  const sid = 'deactivate';
  startSpinner(sid, `Deactivating developer ${id}`);
  const { status, data } = await api('DELETE', `/api/developer/developers/${id}`);
  if (status === 200) { succeedSpinner(sid, data.message || 'Developer deactivated'); }
  else { failSpinner(sid, 'Failed'); logError(data.message); }
}

async function cmdReactivateDeveloper(args) {
  const id = args[0];
  if (!id) { logWarning('Usage: reactivate <developer-id>'); return; }
  const sid = 'reactivate';
  startSpinner(sid, `Reactivating developer ${id}`);
  const { status, data } = await api('POST', `/api/developer/developers/${id}/reactivate`);
  if (status === 200) { succeedSpinner(sid, data.message || 'Developer reactivated'); }
  else { failSpinner(sid, 'Failed'); logError(data.message); }
}

/* ─── Sub-script Launchers ────────────────────────────────────────────────── */

function runScript(scriptName) {
  return new Promise((resolve) => {
    const scriptPath = join(__dirname, scriptName);
    logInfo(`Launching ${chalk.cyan(scriptName)} ...\n`);

    // Pause readline so the child can use stdin
    rl.pause();

    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('close', (code) => {
      console.log(); // blank line after script finishes
      rl.resume();
      resolve(code);
    });

    child.on('error', (err) => {
      logError(`Failed to launch ${scriptName}: ${err.message}`);
      rl.resume();
      resolve(1);
    });
  });
}

async function cmdCreateDev() {
  await runScript('create-developer.js');
}

async function cmdChangeRole() {
  await runScript('change-role.js');
}

/* ─── Help ────────────────────────────────────────────────────────────────── */

function printHelp() {
  const C = chalk;
  logBox('DP Developer CLI — Command Reference', [
    C.bold.white('Authentication'),
    `  ${C.cyan('login')}                     Authenticate as a developer`,
    `  ${C.cyan('whoami')}                    Show current session details`,
    `  ${C.cyan('logout')}                    Clear current session token`,
    '',
    C.bold.white('Request Tracking'),
    `  ${C.cyan('tracking status')}           Show tracking on/off + log count`,
    `  ${C.cyan('tracking enable')}           Start logging all API requests`,
    `  ${C.cyan('tracking disable')}          Stop logging, flush to disk`,
    '',
    C.bold.white('Logs & Statistics'),
    `  ${C.cyan('logs')} ${C.gray('[options]')}             View recent request logs`,
    `    ${C.gray('--limit <n>')}             Max records (default 100)`,
    `    ${C.gray('--method <GET|POST|…>')}   Filter by HTTP method`,
    `    ${C.gray('--status <200|404|…>')}    Filter by status code`,
    `    ${C.gray('--identity <admin|…>')}    Filter by identity type`,
    `    ${C.gray('--search <query>')}        Search URL / name / email / IP`,
    `    ${C.gray('--today')}                 Today\'s logs only`,
    `  ${C.cyan('stats')}                     Request statistics breakdown`,
    `  ${C.cyan('clear')}                     Delete all stored logs`,
    '',
    C.bold.white('Developer Management'),
    `  ${C.cyan('create-dev')}                Create a new developer (interactive)`,
    `  ${C.cyan('change-role')}               Change any admin\'s role (interactive)`,
    `  ${C.cyan('developers')}                List all developer accounts`,
    `  ${C.cyan('deactivate <id>')}           Disable a developer account`,
    `  ${C.cyan('reactivate <id>')}           Re-enable a developer account`,
    '',
    C.bold.white('System'),
    `  ${C.cyan('system')}                    Server / database health info`,
    `  ${C.cyan('help')}                      Show this help`,
    `  ${C.cyan('exit')} / ${C.cyan('quit')}                Exit the CLI`,
  ].join('\n'));
}

/* ─── Command Router ──────────────────────────────────────────────────────── */

async function execute(input) {
  const parts = input.trim().split(/\s+/);
  const cmd   = parts[0]?.toLowerCase();
  const args  = parts.slice(1);

  if (!cmd) return;

  const requiresLogin = (c) => {
    if (!TOKEN) {
      logWarning(`Not logged in. Run: ${chalk.cyan('login')}`);
      return true;
    }
    return false;
  };

  try {
    switch (cmd) {
      case 'help': case '?':           printHelp();                                     break;
      case 'login':                    await cmdLogin();                                 break;
      case 'whoami':                   await cmdWhoami();                                break;
      case 'logout':
        TOKEN = null; currentDev = null;
        logSuccess('Session cleared');                                                   break;

      case 'tracking':
        if (requiresLogin()) break;
        if (args[0] === 'status')       await cmdTrackingStatus();
        else if (args[0] === 'enable')  await cmdTrackingEnable();
        else if (args[0] === 'disable') await cmdTrackingDisable();
        else logWarning('Usage: tracking <status | enable | disable>');
        break;

      case 'logs':     if (requiresLogin()) break; await cmdLogs(args);              break;
      case 'stats':    if (requiresLogin()) break; await cmdStats();                  break;
      case 'clear':    if (requiresLogin()) break; await cmdClearLogs();              break;
      case 'system':   if (requiresLogin()) break; await cmdSystem();                 break;

      case 'create':
      case 'create-dev':
      case 'create-developer':
        await cmdCreateDev(); break;

      case 'change-role':
      case 'changerole':
        await cmdChangeRole(); break;

      case 'developers':
      case 'devs':
        if (requiresLogin()) break; await cmdListDevelopers(); break;

      case 'deactivate':
        if (requiresLogin()) break; await cmdDeactivateDeveloper(args); break;

      case 'reactivate':
        if (requiresLogin()) break; await cmdReactivateDeveloper(args); break;

      case 'exit': case 'quit': case 'q':
        logSuccess('Goodbye! 👋');
        process.exit(0);
        break;

      default:
        logWarning(`Unknown command: ${chalk.bold(cmd)}  —  type ${chalk.cyan('help')} for the list`);
    }
  } catch (err) {
    logError(`Command failed: ${err.message}`);
  }
}

/* ─── Welcome Banner ──────────────────────────────────────────────────────── */

function printWelcome() {
  const cols = Math.min(process.stdout.columns || 80, 90);
  const line = chalk.gray('─'.repeat(cols));

  console.clear();
  console.log();
  console.log(chalk.bold.blue('  ██████╗ ██████╗     ██████╗ ███████╗██╗   ██╗'));
  console.log(chalk.bold.blue('  ██╔══██╗██╔══██╗    ██╔══██╗██╔════╝██║   ██║'));
  console.log(chalk.bold.blue('  ██║  ██║██████╔╝    ██║  ██║█████╗  ██║   ██║'));
  console.log(chalk.bold.blue('  ██║  ██║██╔═══╝     ██║  ██║██╔══╝  ╚██╗ ██╔╝'));
  console.log(chalk.bold.blue('  ██████╔╝██║         ██████╔╝███████╗ ╚████╔╝ '));
  console.log(chalk.bold.blue('  ╚═════╝ ╚═╝         ╚═════╝ ╚══════╝  ╚═══╝  '));
  console.log();
  console.log(line);
  console.log(`  ${chalk.bold.white('DP Attendance')} — Developer CLI  ${chalk.gray('v8.0')}   ${chalk.gray(API_URL)}`);
  console.log(`  ${chalk.gray('Type')} ${chalk.cyan('help')} ${chalk.gray('for commands,  or')} ${chalk.cyan('login')} ${chalk.gray('to start.')}`);
  console.log(line);
  console.log();
}

/* ─── Single-shot Mode ────────────────────────────────────────────────────── */

async function runOnce() {
  const args = process.argv.slice(2);
  if (!args.length) return false;
  await execute(args.join(' '));
  rl.close();
  return true;
}

/* ─── Interactive REPL ────────────────────────────────────────────────────── */

async function runInteractive() {
  printWelcome();

  const loop = () => {
    const loginLabel = TOKEN
      ? chalk.green(`${currentDev?.name || 'dev'}`)
      : chalk.red('guest');

    rl.question(`${chalk.gray('  ')}${chalk.cyan('dp')}${chalk.gray('@')}${loginLabel}${chalk.cyan('>')} `, async (raw) => {
      const input = raw.trim();
      if (input) {
        await execute(input);
        printStatusBar();
      }
      loop();
    });
  };

  loop();

  rl.on('close', () => {
    console.log();
    logSuccess('Session ended');
    process.exit(0);
  });
}

/* ─── Main ────────────────────────────────────────────────────────────────── */

async function main() {
  const ranOnce = await runOnce();
  if (!ranOnce) await runInteractive();
}

main().catch(err => {
  logError(err.message);
  process.exit(1);
});
