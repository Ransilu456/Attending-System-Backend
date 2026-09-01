import chalk from 'chalk';

// Terminal icon glyph dictionary
const icons = {
  info: '🔹',
  success: '✨',
  warning: '⚠️',
  error: '❌',
  database: '🗃️',
  server: '🚀',
  config: '⚙️',
  time: '🕒',
  user: '👤',
  security: '🔒',
  api: '🔌',
  web: '🌐',
  report: '📊',
  attendance: '📋',
  qr: '📷',
  message: '💬',
  network: '🌍',
  firewall: '🛡️',
  connection: '🔗',
  loading: '⏳',
  check: '✅',
  cross: '❌',
  arrow: '➜',
  star: '⭐',
  lock: '🔐',
  key: '🔑',
  bell: '🔔',
  clock: '⏰',
  calendar: '📅',
  file: '📄',
  folder: '📁',
  search: '🔍',
  settings: '⚙️',
  power: '🔌',
  refresh: '🔄',
  download: '⬇️',
  upload: '⬆️',
  trash: '🗑️',
  edit: '✏️',
  plus: '➕',
  minus: '➖',
  question: '❓',
  exclamation: '❗',
  heart: '❤️',
  sparkles: '✨',
  rocket: '🚀',
  gear: '⚙️',
  shield: '🛡️',
  bug: '🐛',
  fix: '🔧',
  test: '🧪',
  deploy: '🚀',
  monitor: '📺',
  terminal: '💻'
};

const spinners = {};

// Print application startup banner to console
export const printBanner = () => {
  console.clear();
  const border = chalk.blueBright('═'.repeat(process.stdout.columns || 80));
  console.log(border);
  console.log(chalk.cyanBright(`
     █████╗ ██████╗     █████╗ ████████╗████████╗███████╗███╗   ██╗██████╗ ███████╗███╗   ██╗ ██████╗███████╗
    ██╔══██╗██╔══██╗   ██╔══██╗╚══██╔══╝╚══██╔══╝██╔════╝████╗  ██║██╔══██╗██╔════╝████╗  ██║██╔════╝██╔════╝
    ██║  ██║██████╔╝   ███████║   ██║      ██║   █████╗  ██╔██╗ ██║██║  ██║█████╗  ██╔██╗ ██║██║     █████╗  
    ██║ █╗█║██╔══██╗   ██╔══██║   ██║      ██║   ██╔══╝  ██║╚██╗██║██║  ██║██╔══╝  ██║╚██╗██║██║     ██╔══╝  
    ╚█████╔╝██║  ██║   ██║  ██║   ██║      ██║   ███████╗██║ ╚████║██████╔╝███████╗██║ ╚████║╚██████╗███████╗
     ╚═══╝╚╝╚═╝  ╚═╝   ╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═══╝╚═════╝ ╚══════╝╚═╝  ╚═══╝ ╚═════╝╚══════╝
  `));

  console.log(chalk.blueBright('╔' + '═'.repeat((process.stdout.columns || 80) - 2) + '╗'));
  const subtitle = chalk.bold('Smart Attendance Management System');
  const version = chalk.greenBright('v8.1.0');
  const padding = Math.floor(((process.stdout.columns || 80) - subtitle.length - version.length - 4) / 2);
  console.log(
    chalk.blueBright('║') + ' '.repeat(padding) +
    subtitle + ' ' + version +
    ' '.repeat(Math.max(0, (process.stdout.columns || 80) - subtitle.length - version.length - padding - 4)) +
    chalk.blueBright('║')
  );
  console.log(chalk.blueBright('╚' + '═'.repeat((process.stdout.columns || 80) - 2) + '╝'));
};

// Standard logging methods
export const logInfo = (msg) => console.log(chalk.blue(icons.info + ' ' + msg));
export const logSuccess = (msg) => console.log(chalk.green(icons.success + ' ' + msg));
export const logWarning = (msg) => console.log(chalk.yellow(icons.warning + ' ' + msg));
export const logError = (msg, error = null) => {
  console.log(chalk.red('\n' + icons.error + ' ' + msg));
  if (error?.stack) {
    console.log(chalk.gray('  Stack Trace:'));
    console.log(chalk.red(error.stack));
  }
  console.log();
};

export const logReport = (msg) => console.log(chalk.magenta(icons.report + ' ' + msg));
export const logAttendance = (msg) => console.log(chalk.cyan(icons.attendance + ' ' + msg));
export const logQR = (msg) => console.log(chalk.greenBright(icons.qr + ' ' + msg));
export const logMessage = (msg) => console.log(chalk.blueBright(icons.message + ' ' + msg));
export const logNetwork = (msg) => console.log(chalk.cyanBright(icons.network + ' ' + msg));
export const logSecurity = (msg) => console.log(chalk.redBright(icons.security + ' ' + msg));
export const logConnection = (msg) => console.log(chalk.yellowBright(icons.connection + ' ' + msg));
export const logDeploy = (msg) => console.log(chalk.greenBright(icons.deploy + ' ' + msg));
export const logMonitor = (msg) => console.log(chalk.magentaBright(icons.monitor + ' ' + msg));
export const logTerminal = (msg) => console.log(chalk.whiteBright(icons.terminal + ' ' + msg));

// Format and output section headers
export const logSection = (title, icon = '') => {
  const sectionIcon = icons[title.toLowerCase()] || icon || '📌';
  const cols = process.stdout.columns || 80;
  console.log(chalk.blueBright('\n┌─' + sectionIcon + '─' + '─'.repeat(Math.max(0, cols - 6)) + '┐'));
  console.log(chalk.whiteBright('│ ' + title + ' '.repeat(Math.max(0, cols - title.length - 4)) + ' │'));
  console.log(chalk.blueBright('└' + '─'.repeat(Math.max(0, cols - 2)) + '┘'));
};

// Log successful server boot details
export const logServerStart = (port) => {
  const message = `Server running on port ${port}`;
  const timestamp = new Date().toLocaleTimeString();
  const cols = process.stdout.columns || 80;

  console.log(chalk.green('\n' + '┌' + '─'.repeat(Math.max(0, cols - 2)) + '┐'));
  console.log(chalk.green('│' + ' '.repeat(Math.max(0, Math.floor((cols - message.length - 2) / 2))) + message +
              ' '.repeat(Math.max(0, Math.ceil((cols - message.length - 2) / 2))) + '│'));
  console.log(chalk.green('│' + ' '.repeat(Math.max(0, Math.floor((cols - timestamp.length - 2) / 2))) + timestamp +
              ' '.repeat(Math.max(0, Math.ceil((cols - timestamp.length - 2) / 2))) + '│'));
  console.log(chalk.green('└' + '─'.repeat(Math.max(0, cols - 2)) + '┘\n'));
};

// CLI Spinner helpers
export const startSpinner = (id, text) => {
  if (spinners[id]) stopSpinner(id);
  spinners[id] = { text, startTime: Date.now(), progress: 0 };
  process.stdout.write(chalk.yellow(text + '...'));
  return spinners[id];
};

export const updateSpinner = (id, text, progress = null) => {
  if (spinners[id]) {
    spinners[id].text = text;
    if (progress !== null) spinners[id].progress = progress;
    const progressBar = progress !== null ? chalk.cyan(` [${Math.floor(progress * 100)}%]`) : '';
    process.stdout.write('\r' + chalk.yellow(text) + progressBar + '...');
  }
};

export const succeedSpinner = (id, text) => {
  if (spinners[id]) {
    const time = Date.now() - spinners[id].startTime;
    process.stdout.write('\r' + chalk.green((text || spinners[id].text) + ' ✓ (' + time + 'ms)\n'));
    delete spinners[id];
  }
};

export const failSpinner = (id, text) => {
  if (spinners[id]) {
    const time = Date.now() - spinners[id].startTime;
    process.stdout.write('\r' + chalk.red((text || spinners[id].text) + ' ✗ (' + time + 'ms)\n'));
    delete spinners[id];
  }
};

export const stopSpinner = (id) => {
  if (spinners[id]) {
    process.stdout.write('\n');
    delete spinners[id];
  }
};

// CLI Progress bar and utility formatters
export const logProgress = (current, total, message = 'Progress') => {
  const progress = current / total;
  const barLength = 30;
  const filledLength = Math.round(barLength * progress);
  const bar = chalk.green('█'.repeat(filledLength)) + chalk.gray('░'.repeat(barLength - filledLength));
  const percentage = Math.round(progress * 100);
  process.stdout.write(`\r${chalk.cyan(message)}: [${bar}] ${chalk.yellow(percentage + '%')}`);
  if (current === total) process.stdout.write('\n');
};

export const logBox = (title, content) => {
  const cols = process.stdout.columns || 80;
  const padding = 2;
  const width = cols - (padding * 2);

  console.log(chalk.blue('\n┌' + '─'.repeat(Math.max(0, width)) + '┐'));
  console.log(chalk.white('│' + ' '.repeat(padding) + chalk.bold(title) +
              ' '.repeat(Math.max(0, width - title.length - (padding * 2))) + '│'));
  console.log(chalk.blue('├' + '─'.repeat(Math.max(0, width)) + '┤'));

  const lines = content.split('\n');
  lines.forEach(line => {
    const padded = line.padEnd(Math.max(0, width - (padding * 2)));
    console.log('│' + ' '.repeat(padding) + chalk.gray(padded) + ' '.repeat(padding) + '│');
  });

  console.log(chalk.blue('└' + '─'.repeat(Math.max(0, width)) + '┘\n'));
};

export const logTable = (data, heading = '') => {
  if (!data || !data.length) return logWarning('No data to display in table');
  if (heading) logBox(heading, '');
  console.table(data);
};

export const logTimeTaken = (operation, startTime) => {
  const time = Date.now() - startTime;
  const formatted = time < 1000 ? `${time}ms` : `${(time / 1000).toFixed(2)}s`;
  console.log(chalk.cyan(icons.time + ' ' + `${operation}: ${formatted}`));
};

export const formatObject = (obj) => JSON.stringify(obj, null, 2);
export const getIcons = () => icons;

export default {
  printBanner,
  logInfo,
  logSuccess,
  logWarning,
  logError,
  logReport,
  logAttendance,
  logQR,
  logMessage,
  logNetwork,
  logSecurity,
  logConnection,
  logDeploy,
  logMonitor,
  logTerminal,
  logSection,
  logServerStart,
  startSpinner,
  updateSpinner,
  succeedSpinner,
  failSpinner,
  stopSpinner,
  logProgress,
  logBox,
  logTable,
  logTimeTaken,
  formatObject,
  getIcons
};
