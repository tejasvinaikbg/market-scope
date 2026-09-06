/**
 * Process-wide pino logger: JSON lines by default, pretty-printed only when a human is watching a terminal.
 */
import pino from 'pino';
import { config } from '../config.ts';

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: process.stdout.isTTY ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
});
export type Logger = typeof logger;
