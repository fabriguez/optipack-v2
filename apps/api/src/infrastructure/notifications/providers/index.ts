/**
 * Initialisation des providers de canaux externes au demarrage de l'API.
 *
 * Activation par env vars :
 *   - SMS_PROVIDER         : 'twilio' | 'africas-talking' | 'vonage' | 'log' (defaut: 'log')
 *   - WHATSAPP_PROVIDER    : 'twilio' | 'meta' | 'log' (defaut: 'log')
 *   - PUSH_PROVIDER        : 'fcm' | 'log' (defaut: 'log')
 *
 * Le provider 'log' est un stub qui ne fait rien sauf logger. Permet de
 * developper l'UI sans coute reseau, et de detecter quels evenements
 * declenchent des envois. Quand on branche un vrai provider, on remplace
 * la valeur d'env et on ajoute les credentials necessaires.
 */

import {
  setPushProvider,
  setSmsProvider,
  setWhatsappProvider,
} from '../../../application/services/notifications/channels';
import type { ExternalChannelProvider } from '../../../application/services/notifications/types';
import { createChildLogger } from '../../../config/logger';

const logger = createChildLogger('NotifProviders');

function makeLogProvider(channelName: string): ExternalChannelProvider {
  return {
    name: 'log',
    enabled: true,
    async send(to, message, meta) {
      logger.info(
        { channel: channelName, to, msg: message.slice(0, 100), meta },
        `[STUB ${channelName}] message qui serait envoye`,
      );
    },
  };
}

/**
 * Place pour le vrai provider Twilio SMS. A activer en branchant le SDK :
 *   npm i twilio
 *   credentials : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 */
function makeTwilioSmsProvider(): ExternalChannelProvider {
  return {
    name: 'twilio',
    // Tant que le SDK n'est pas branche, on marque desactive pour eviter
    // d'envoyer en pretendant que ca marche. SKIPPED cote dispatcher.
    enabled: false,
    async send(_to, _message) {
      throw new Error('Twilio SMS provider non implemente -- a brancher.');
    },
  };
}

function makeMetaWhatsappProvider(): ExternalChannelProvider {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';
  const enabled = !!accessToken && !!phoneNumberId;
  if (!enabled) {
    logger.warn(
      'Meta WhatsApp provider non active : WHATSAPP_ACCESS_TOKEN et/ou WHATSAPP_PHONE_NUMBER_ID manquant(s)',
    );
  }
  return {
    name: 'meta-cloud-api',
    enabled,
    async send(to, message) {
      if (!enabled) throw new Error('Meta WhatsApp provider non configure');
      // Meta exige format E.164 sans le +, ex: 237691234567.
      const recipient = to.replace(/[^0-9]/g, '');
      const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'text',
          text: { preview_url: false, body: message },
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Meta WhatsApp HTTP ${res.status}: ${errBody.slice(0, 300)}`);
      }
    },
  };
}

function makeFcmPushProvider(): ExternalChannelProvider {
  return {
    name: 'fcm',
    enabled: false,
    async send(_to, _message) {
      throw new Error('FCM push provider non implemente -- a brancher.');
    },
  };
}

export function registerNotificationProviders(): void {
  const smsKind = (process.env.SMS_PROVIDER ?? 'log').toLowerCase();
  const waKind = (process.env.WHATSAPP_PROVIDER ?? 'log').toLowerCase();
  const pushKind = (process.env.PUSH_PROVIDER ?? 'log').toLowerCase();

  setSmsProvider(
    smsKind === 'twilio' ? makeTwilioSmsProvider()
    : smsKind === 'log' ? makeLogProvider('SMS')
    : null,
  );
  setWhatsappProvider(
    waKind === 'meta' ? makeMetaWhatsappProvider()
    : waKind === 'log' ? makeLogProvider('WHATSAPP')
    : null,
  );
  setPushProvider(
    pushKind === 'fcm' ? makeFcmPushProvider()
    : pushKind === 'log' ? makeLogProvider('PUSH')
    : null,
  );

  logger.info(
    { smsKind, waKind, pushKind },
    'Notification providers registered',
  );
}
