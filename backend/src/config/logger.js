/**
 * Centralized logging with configurable log levels
 * Levels: DEBUG=0, INFO=1, WARN=2, ERROR=3
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'INFO'];

function log(level, tag, message, data = null) {
  const levelValue = LOG_LEVELS[level];

  // Only log if level meets threshold
  if (levelValue < currentLevel) return;

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}] [${tag}]`;

  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export const logger = {
  debug: (tag, message, data) => log('DEBUG', tag, message, data),
  info: (tag, message, data) => log('INFO', tag, message, data),
  warn: (tag, message, data) => log('WARN', tag, message, data),
  error: (tag, message, data) => log('ERROR', tag, message, data),
};

export default logger;
