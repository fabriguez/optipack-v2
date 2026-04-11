import pino from 'pino';
import { config } from './index';

export const logger = pino({
  level: config.env === 'production' ? 'info' : 'debug',
  transport:
    config.env === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  redact: ['req.headers.authorization', 'password', 'token', 'refreshToken'],
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

export function createChildLogger(module: string) {
  return logger.child({ module });
}
