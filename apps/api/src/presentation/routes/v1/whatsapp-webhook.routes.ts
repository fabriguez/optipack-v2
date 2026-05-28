import { Router } from 'express';
import { createChildLogger } from '../../../config/logger';

const logger = createChildLogger('WhatsAppWebhook');
const router = Router();

/**
 * Webhook WhatsApp (Meta Cloud API).
 *
 * Config Meta a renseigner dans le dashboard Meta for Developers :
 *   - Callback URL : {API_URL}/api/v1/webhooks/whatsapp
 *   - Verify Token : valeur de l'env WHATSAPP_VERIFY_TOKEN
 *
 * Routes :
 *   - GET  /webhooks/whatsapp : verification du webhook (hub.challenge)
 *   - POST /webhooks/whatsapp : reception des messages + statuts
 *
 * Aucune auth applicative : Meta appelle ces endpoints publiquement.
 * Verification d'origine via hub.verify_token (GET) + facultativement
 * X-Hub-Signature-256 (POST) si app secret configure.
 */

// Verification Meta : Meta envoie GET avec hub.mode=subscribe, hub.verify_token,
// hub.challenge. On verifie le token et renvoie le challenge.
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!expected) {
    logger.warn('WHATSAPP_VERIFY_TOKEN non configure dans .env');
    return res.status(500).send('Verify token not configured');
  }

  if (mode === 'subscribe' && token === expected) {
    logger.info({ mode }, 'WhatsApp webhook verifie');
    return res.status(200).send(challenge);
  }

  logger.warn({ mode, providedToken: token }, 'WhatsApp webhook verification refused');
  return res.sendStatus(403);
});

// Reception : messages entrants + statuts (sent/delivered/read/failed).
router.post('/', async (req, res) => {
  try {
    const body = req.body as any;
    if (body?.object !== 'whatsapp_business_account') {
      return res.sendStatus(404);
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        const messages = value?.messages ?? [];
        const statuses = value?.statuses ?? [];

        for (const msg of messages) {
          logger.info(
            { from: msg.from, type: msg.type, id: msg.id, text: msg.text?.body },
            'Message WhatsApp recu',
          );
          // TODO : router vers ChatService pour persister + repondre.
        }

        for (const st of statuses) {
          logger.info(
            { messageId: st.id, status: st.status, recipient: st.recipient_id },
            'Statut WhatsApp recu',
          );
          // TODO : maj statut Notification (sent/delivered/read/failed).
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    logger.error({ err }, 'Erreur traitement webhook WhatsApp');
    res.sendStatus(500);
  }
});

export default router;
