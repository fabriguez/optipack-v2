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
            // Format compact : "YYYY-MM-DD HH:MM:SS [LEVEL] [module] [reqId-8] msg"
            // (extras passes au msg). singleLine = pas de YAML multi-lignes.
            singleLine: true,
            ignore: 'pid,hostname,module,requestId,userId,method,url,statusCode,duration,remoteAddress',
            messageFormat:
              '{if module}[{module}] {end}{if requestId}[{requestId}] {end}{msg}{if method} | {method} {url} {statusCode} ({duration}){end}',
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
