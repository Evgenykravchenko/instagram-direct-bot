import 'dotenv/config';
import { Application } from './app.js';
import { loadConfig } from './config/env.js';
import { createLogger } from './config/logger.js';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL, config.NODE_ENV);
const app = new Application(config, logger);

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'Stopping application');
  try {
    await app.stop();
    process.exitCode = 0;
  } catch (error) {
    logger.error({ err: error }, 'Graceful shutdown failed');
    process.exitCode = 1;
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  void shutdown('uncaughtException');
});
process.on('unhandledRejection', (error) => {
  logger.fatal({ err: error }, 'Unhandled rejection');
  void shutdown('unhandledRejection');
});

app.start().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Application failed to start');
  process.exitCode = 1;
});
