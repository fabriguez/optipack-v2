/**
 * Initialisation des providers de canaux externes au demarrage de l'API.
 *
 * Activation par env vars :
 *   - SMS_PROVIDER              : 'twilio' | 'africas-talking' | 'vonage' | 'log' (defaut: 'log')
 *   - WHATSAPP_PROVIDER_CHAIN   : liste ordonnee de providers a enchaîner en fallback
 *                                 ex: 'twilio,wapino' (essaie twilio, puis wapino si echec)
 *                                 Valeurs : 'twilio' | 'wapino' | 'meta' | 'africas-talking' | 'log'
 *                                 Defaut : 'twilio,wapino'
 *   - PUSH_PROVIDER             : 'expo' | 'fcm' | 'log' (defaut: 'log')
 *
 * Credentials Twilio WhatsApp :
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (E.164)
 *
 * Credentials Wapino WhatsApp :
 *   WAPINO_API_KEY    (Bearer token, ex: wp_live_...)
 *   WAPINO_INSTANCE   (nom de l'instance Wapino, ex: "OptiPack")
 *
 * Credentials Africa's Talking (SMS + WhatsApp partagent username/apiKey) :
 *   AT_USERNAME, AT_API_KEY
 *   AT_SMS_FROM (sender id optionnel)
 *   AT_SMS_SANDBOX=true pour l'env sandbox
 *   AT_WA_FROM (numero WhatsApp expediteur)
 *   AT_WA_SANDBOX=true pour l'env sandbox
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
    async sendDocument(to, url, filename, caption) {
      logger.info(
        { channel: channelName, to, url, filename, caption },
        `[STUB ${channelName}] document qui serait envoye`,
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

/**
 * Africa's Talking SMS provider.
 * Doc : https://developers.africastalking.com/docs/sms/overview
 * Env :
 *   AT_USERNAME             (sandbox: "sandbox", prod: votre username AT)
 *   AT_API_KEY              cle d'API
 *   AT_SMS_FROM             expediteur / sender id (optionnel)
 *   AT_SMS_SANDBOX=true     pour utiliser l'env sandbox
 */
function makeAfricasTalkingSmsProvider(): ExternalChannelProvider {
  const username = process.env.AT_USERNAME ?? '';
  const apiKey = process.env.AT_API_KEY ?? '';
  const from = process.env.AT_SMS_FROM ?? '';
  const sandbox = (process.env.AT_SMS_SANDBOX ?? '').toLowerCase() === 'true';
  const enabled = !!username && !!apiKey;
  if (!enabled) {
    logger.warn(
      'Africa\'s Talking SMS provider non active : AT_USERNAME et/ou AT_API_KEY manquant(s)',
    );
  }
  const baseUrl = sandbox
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';
  return {
    name: 'africas-talking',
    enabled,
    async send(to, message) {
      if (!enabled) throw new Error('Africa\'s Talking SMS provider non configure');
      const body = new URLSearchParams();
      body.set('username', username);
      body.set('to', to);
      body.set('message', message);
      if (from) body.set('from', from);
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          apiKey,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Africa's Talking SMS HTTP ${res.status}: ${txt.slice(0, 300)}`);
      }
      const data = (await res.json().catch(() => null)) as
        | { SMSMessageData?: { Recipients?: Array<{ status?: string; statusCode?: number; messageId?: string }> } }
        | null;
      const rcpt = data?.SMSMessageData?.Recipients?.[0];
      // statusCode 100..102 = Success/Queued; tout autre = echec
      if (rcpt && rcpt.statusCode && rcpt.statusCode > 102) {
        throw new Error(`Africa's Talking SMS rejected: ${rcpt.status} (${rcpt.statusCode})`);
      }
    },
  };
}

/**
 * Vonage / Nexmo SMS provider (stub, a brancher si besoin).
 * Env : VONAGE_API_KEY, VONAGE_API_SECRET, VONAGE_FROM
 */
function makeVonageSmsProvider(): ExternalChannelProvider {
  const apiKey = process.env.VONAGE_API_KEY ?? '';
  const apiSecret = process.env.VONAGE_API_SECRET ?? '';
  const from = process.env.VONAGE_FROM ?? 'OptiPack';
  const enabled = !!apiKey && !!apiSecret;
  if (!enabled) {
    logger.warn('Vonage SMS provider non active : VONAGE_API_KEY/SECRET manquant(s)');
  }
  return {
    name: 'vonage',
    enabled,
    async send(to, message) {
      if (!enabled) throw new Error('Vonage SMS provider non configure');
      const body = new URLSearchParams({
        api_key: apiKey,
        api_secret: apiSecret,
        to: to.replace(/[^0-9]/g, ''),
        from,
        text: message,
      });
      const res = await fetch('https://rest.nexmo.com/sms/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Vonage SMS HTTP ${res.status}: ${txt.slice(0, 300)}`);
      }
    },
  };
}

/**
 * Africa's Talking WhatsApp provider.
 * Doc : https://developers.africastalking.com/docs/whatsapp/overview
 * Env :
 *   AT_USERNAME
 *   AT_API_KEY
 *   AT_WA_FROM              numero WhatsApp expediteur enregistre AT
 *   AT_WA_SANDBOX=true      pour utiliser l'env sandbox
 */
function makeAfricasTalkingWhatsappProvider(): ExternalChannelProvider {
  const username = process.env.AT_USERNAME ?? '';
  const apiKey = process.env.AT_API_KEY ?? '';
  const waFrom = process.env.AT_WA_FROM ?? '';
  const sandbox = (process.env.AT_WA_SANDBOX ?? '').toLowerCase() === 'true';
  const enabled = !!username && !!apiKey && !!waFrom;
  if (!enabled) {
    logger.warn(
      'Africa\'s Talking WhatsApp provider non active : AT_USERNAME, AT_API_KEY ou AT_WA_FROM manquant(s)',
    );
  }
  const url = sandbox
    ? 'https://chat.sandbox.africastalking.com/whatsapp/message'
    : 'https://chat.africastalking.com/whatsapp/message';
  const atSend = async (to: string, body: Record<string, unknown>) => {
    const recipient = to.startsWith('+') ? to : `+${to.replace(/[^0-9]/g, '')}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, waNumber: waFrom, phoneNumber: recipient, body }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Africa's Talking WhatsApp HTTP ${res.status}: ${txt.slice(0, 300)}`);
    }
  };
  return {
    name: 'africas-talking',
    enabled,
    async send(to, message) {
      if (!enabled) throw new Error('Africa\'s Talking WhatsApp provider non configure');
      await atSend(to, { type: 'PlainText', text: message });
    },
    async sendDocument(to, docUrl, filename, caption) {
      if (!enabled) throw new Error('Africa\'s Talking WhatsApp provider non configure');
      await atSend(to, { type: 'document', url: docUrl, filename, caption: caption ?? '' });
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
  const metaSend = async (recipient: string, payload: Record<string, unknown>) => {
    const apiUrl = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: recipient, ...payload }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Meta WhatsApp HTTP ${res.status}: ${errBody.slice(0, 300)}`);
    }
  };
  return {
    name: 'meta-cloud-api',
    enabled,
    async send(to, message) {
      if (!enabled) throw new Error('Meta WhatsApp provider non configure');
      const recipient = to.replace(/[^0-9]/g, '');
      await metaSend(recipient, { type: 'text', text: { preview_url: false, body: message } });
    },
    async sendDocument(to, docUrl, filename, caption) {
      if (!enabled) throw new Error('Meta WhatsApp provider non configure');
      const recipient = to.replace(/[^0-9]/g, '');
      await metaSend(recipient, {
        type: 'document',
        document: { link: docUrl, filename, caption: caption ?? '' },
      });
    },
  };
}

/**
 * Twilio WhatsApp provider (API REST, sans SDK).
 * Doc : https://www.twilio.com/docs/whatsapp/api
 * Env :
 *   TWILIO_ACCOUNT_SID      identifiant du compte (AC...)
 *   TWILIO_AUTH_TOKEN       token d'auth
 *   TWILIO_WHATSAPP_FROM    numero WhatsApp expediteur E.164 (ex: +14155238886
 *                           pour le sandbox Twilio)
 *
 * Twilio attend le prefixe "whatsapp:" sur To et From, et le numero au
 * format E.164. En sandbox, le destinataire doit avoir rejoint le sandbox.
 */
function makeTwilioWhatsappProvider(): ExternalChannelProvider {
  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? '';
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? '';
  const from = process.env.TWILIO_WHATSAPP_FROM ?? '';
  const enabled = !!accountSid && !!authToken && !!from;
  if (!enabled) {
    logger.warn(
      'Twilio WhatsApp provider non active : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN ou TWILIO_WHATSAPP_FROM manquant(s)',
    );
  }
  const toWhatsapp = (n: string) => {
    const e164 = n.startsWith('+') ? n : `+${n.replace(/[^0-9]/g, '')}`;
    return `whatsapp:${e164}`;
  };
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const twilioSend = async (params: Record<string, string>) => {
    const body = new URLSearchParams(params);
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Twilio WhatsApp HTTP ${res.status}: ${txt.slice(0, 300)}`);
    }
  };
  return {
    name: 'twilio',
    enabled,
    async send(to, message) {
      if (!enabled) throw new Error('Twilio WhatsApp provider non configure');
      await twilioSend({ To: toWhatsapp(to), From: toWhatsapp(from), Body: message });
    },
    async sendDocument(to, docUrl, filename, caption) {
      if (!enabled) throw new Error('Twilio WhatsApp provider non configure');
      await twilioSend({
        To: toWhatsapp(to),
        From: toWhatsapp(from),
        Body: caption ?? filename,
        MediaUrl0: docUrl,
      });
    },
  };
}

/**
 * Wapino WhatsApp provider.
 * Doc : https://wapino.consolidis.com/docs
 * Env :
 *   WAPINO_API_KEY      Bearer token (ex: wp_live_...)
 *   WAPINO_INSTANCE     Nom de l'instance Wapino (ex: "OptiPack")
 *
 * number format : international sans le +, ex 237690000000
 */
function makeWapinoWhatsappProvider(): ExternalChannelProvider {
  const apiKey = process.env.WAPINO_API_KEY ?? '';
  const instance = process.env.WAPINO_INSTANCE ?? '';
  const enabled = !!apiKey && !!instance;
  if (!enabled) {
    logger.warn(
      'Wapino WhatsApp provider non active : WAPINO_API_KEY et/ou WAPINO_INSTANCE manquant(s)',
    );
  }
  const wapinoFetch = async (endpoint: string, body: Record<string, unknown>) => {
    const res = await fetch(`https://api.wapino.consolidis.com/v1/messages/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Wapino WhatsApp HTTP ${res.status}: ${txt.slice(0, 300)}`);
    }
  };
  return {
    name: 'wapino',
    enabled,
    async send(to, message) {
      if (!enabled) throw new Error('Wapino WhatsApp provider non configure');
      const number = to.replace(/[^0-9]/g, '');
      await wapinoFetch('send-text', { instance, number, text: message });
    },
    async sendDocument(to, docUrl, filename, caption) {
      if (!enabled) throw new Error('Wapino WhatsApp provider non configure');
      const number = to.replace(/[^0-9]/g, '');
      await wapinoFetch('send-media', {
        instance,
        number,
        mediaUrl: docUrl,
        type: 'document',
        fileName: filename,
        ...(caption ? { caption } : {}),
      });
    },
  };
}

/**
 * Construit une chaine de fallback a partir d'une liste ordonnee de providers.
 * Essaie chaque provider dans l'ordre ; passe au suivant si le precedent echoue.
 * Seuls les providers enabled sont tentes.
 */
function makeProviderChain(
  channelLabel: string,
  providers: ExternalChannelProvider[],
): ExternalChannelProvider {
  const enabled = providers.some(p => p.enabled);
  return {
    name: providers.map(p => p.name).join('→'),
    enabled,
    async send(to, message, meta) {
      let lastErr: unknown;
      for (const p of providers) {
        if (!p.enabled) continue;
        try {
          await p.send(to, message, meta);
          return;
        } catch (err) {
          lastErr = err;
          logger.warn(
            { err, provider: p.name, channel: channelLabel },
            `Provider ${p.name} failed, trying next in chain`,
          );
        }
      }
      throw lastErr ?? new Error(`All ${channelLabel} providers in chain failed`);
    },
    async sendDocument(to, url, filename, caption) {
      let lastErr: unknown;
      for (const p of providers) {
        if (!p.enabled || !p.sendDocument) continue;
        try {
          await p.sendDocument(to, url, filename, caption);
          return;
        } catch (err) {
          lastErr = err;
          logger.warn(
            { err, provider: p.name, channel: channelLabel },
            `Provider ${p.name} sendDocument failed, trying next`,
          );
        }
      }
      if (lastErr) throw lastErr;
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

/**
 * Push via l'API Expo (https://exp.host/--/api/v2/push/send). Aucune
 * credential serveur requise : le ciblage se fait par l'ExpoPushToken de
 * l'appareil (genere cote app mobile avec le projectId EAS). Tant qu'aucun
 * client n'a enregistre de token, le canal PUSH est simplement SKIPPED.
 *
 * `to` est un unique ExpoPushToken (ExponentPushToken[...]). En cas de receipt
 * d'erreur (DeviceNotRegistered), le nettoyage du token cote base est laisse a
 * un job ulterieur ; ici on se contente de remonter l'erreur de transport.
 */
function makeExpoPushProvider(): ExternalChannelProvider {
  const ENDPOINT = 'https://exp.host/--/api/v2/push/send';
  return {
    name: 'expo',
    enabled: true,
    async send(to, message, meta) {
      const title = (meta?.title as string | undefined) ?? undefined;
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to,
          title,
          body: message,
          sound: 'default',
          // Donnees de deep-link cote app (kind, trackingNumber, invoiceRef...).
          data: meta ?? {},
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`Expo push HTTP ${res.status}: ${errBody.slice(0, 300)}`);
      }
      // L'API renvoie 200 meme pour des tickets en erreur : on inspecte le statut.
      const json = (await res.json().catch(() => null)) as
        | { data?: { status?: string; message?: string } | Array<{ status?: string; message?: string }> }
        | null;
      const ticket = Array.isArray(json?.data) ? json?.data[0] : json?.data;
      if (ticket?.status === 'error') {
        throw new Error(`Expo push ticket error: ${ticket.message ?? 'inconnu'}`);
      }
    },
  };
}

function resolveWhatsappProvider(name: string): ExternalChannelProvider | null {
  switch (name) {
    case 'twilio': return makeTwilioWhatsappProvider();
    case 'wapino': return makeWapinoWhatsappProvider();
    case 'meta': return makeMetaWhatsappProvider();
    case 'africas-talking': return makeAfricasTalkingWhatsappProvider();
    case 'log': return makeLogProvider('WHATSAPP');
    default: return null;
  }
}

export function registerNotificationProviders(): void {
  const smsKind = (process.env.SMS_PROVIDER ?? 'log').toLowerCase();
  const pushKind = (process.env.PUSH_PROVIDER ?? 'log').toLowerCase();

  // WhatsApp : chaine de fallback ordonnee.
  // WHATSAPP_PROVIDER_CHAIN=twilio,wapino (essaie twilio d'abord, wapino si echec)
  // Retombe sur WHATSAPP_PROVIDER pour compatibilite ascendante.
  const waChainRaw = process.env.WHATSAPP_PROVIDER_CHAIN ?? process.env.WHATSAPP_PROVIDER ?? 'twilio,wapino';
  const waChainNames = waChainRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const waProviders = waChainNames.map(resolveWhatsappProvider).filter((p): p is ExternalChannelProvider => p !== null);

  setSmsProvider(
    smsKind === 'twilio' ? makeTwilioSmsProvider()
    : smsKind === 'africas-talking' ? makeAfricasTalkingSmsProvider()
    : smsKind === 'vonage' ? makeVonageSmsProvider()
    : smsKind === 'log' ? makeLogProvider('SMS')
    : null,
  );

  if (waProviders.length === 0) {
    setWhatsappProvider(null);
  } else if (waProviders.length === 1) {
    setWhatsappProvider(waProviders[0]);
  } else {
    setWhatsappProvider(makeProviderChain('WHATSAPP', waProviders));
  }

  setPushProvider(
    pushKind === 'expo' ? makeExpoPushProvider()
    : pushKind === 'fcm' ? makeFcmPushProvider()
    : pushKind === 'log' ? makeLogProvider('PUSH')
    : null,
  );

  logger.info(
    { smsKind, waChain: waChainNames, pushKind },
    'Notification providers registered',
  );
}
