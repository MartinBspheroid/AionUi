/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tagged, leveled application logger.
 *
 * This is the single approved logging entry point — bare `console.*` is banned
 * by lint in `process/` and `common/` (see `.oxlintrc.json`). Use it from any
 * process type; it is isomorphic.
 *
 * It is intentionally backed by `console`, which the main process and renderer
 * both redirect into `electron-log` (see `process/utils/configureConsoleLog.ts`
 * and electron-log's preload hook). That means every log line written through
 * this module is automatically persisted to the daily rotating log file with
 * the correct level — callers get tagging and level methods without having to
 * know about the transport.
 *
 * Usage:
 *   const log = createLogger('Tray');
 *   log.info('created');
 *   log.error('failed to create', err);
 *   const sub = log.child('icon');   // tag becomes "Tray:icon"
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  /** Derive a logger with a nested tag, e.g. `Tray` → `Tray:icon`. */
  child(subTag: string): Logger;
}

// Map our level names onto console methods. `debug`/`info` exist on the
// electron-log-patched console in both process types; we fall back to `log`
// defensively in case a host environment lacks them.
const CONSOLE_METHOD: Record<LogLevel, 'debug' | 'info' | 'warn' | 'error' | 'log'> = {
  debug: typeof console.debug === 'function' ? 'debug' : 'log',
  info: typeof console.info === 'function' ? 'info' : 'log',
  warn: 'warn',
  error: 'error',
};

function emit(tag: string, level: LogLevel, args: unknown[]): void {
  const method = CONSOLE_METHOD[level];
  // eslint-disable-next-line no-console -- this module is the sanctioned console sink
  console[method](`[${tag}]`, ...args);
}

export function createLogger(tag: string): Logger {
  return {
    debug: (...args) => emit(tag, 'debug', args),
    info: (...args) => emit(tag, 'info', args),
    warn: (...args) => emit(tag, 'warn', args),
    error: (...args) => emit(tag, 'error', args),
    child: (subTag) => createLogger(`${tag}:${subTag}`),
  };
}
