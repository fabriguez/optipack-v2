import pino from 'pino';
import { config } from '../config';

/**
 * Logs lisibles meme en production. pino-pretty est conserve pour le mode
 * `production` sur la control plane parce que personne ne consomme ces logs
 * via un agregateur structure -- ils sont lus a la main via `docker logs`.
 *
 * Pour desactiver et revenir au JSON pur (ex: scrape Datadog/Loki),
 * exporter `LOG_FORMAT=json` dans l'env.
 */
const useJson = process.env.LOG_FORMAT === 'json';

export const logger = pino({
  level: config.env === 'production' ? 'info' : 'debug',
  // Redaction defense-en-profondeur : masque les secrets qui passeraient par
  // les champs structures du logger. NB : la string libre `msg` n'est PAS
  // couverte -- ne jamais interpoler un secret dans un message de log.
  redact: [
    'password',
    '*.password',
    'token',
    '*.token',
    'secret',
    '*.secret',
    'req.headers.authorization',
    'ownerPassword',
    'billing.password',
  ],
  transport: useJson
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
          messageFormat: '{module}{if jobId} job={jobId}{end}{if reqId} req={reqId}{end} | {msg}',
        },
      },
});
