import pino from 'pino';
import { config } from './index';

export const logger = pino({
  level: config.env === 'production' ? 'info' : 'debug',
  // pino-pretty dans tous les envs : lisible humain en dev (couleurs) et prod (monochrome).
  // pino-pretty est en dep prod (pas devDep) donc disponible dans le container Docker.
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: config.env === 'development',
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
      singleLine: true,
      ignore: 'pid,hostname,module,requestId,userId,method,url,statusCode,duration,remoteAddress',
      messageFormat:
        '{if module}[{module}]{end}{if requestId}[{requestId}]{end} {msg}{if method} {method} {url} {statusCode} ({duration}){end}',
    },
  },
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
