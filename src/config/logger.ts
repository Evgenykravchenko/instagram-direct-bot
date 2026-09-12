import pino, { type Logger } from 'pino';

export type { Logger };

export function createLogger(level: string, environment: string): Logger {
  return pino({
    level,
    base: { service: 'instagram-direct-bot', environment },
    redact: {
      paths: ['req.headers.authorization', '*.access_token', '*.token'],
      censor: '[REDACTED]',
    },
  });
}
