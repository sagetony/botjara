import { Request, Response } from 'express';
import crypto from 'crypto';
import logger from '../../utils/logger';
import { WhatsAppWebhookPayload, WhatsAppMessage } from './webhook.types';
import { processIncomingMessage } from '../messaging/message.processor';
import { Tenant } from '../tenants/tenant.model';

// ─── WEBHOOK VERIFICATION (GET) ───────────────────────────
// Meta sends a GET request to verify your webhook endpoint
export const verifyWebhook = (req: Request, res: Response): void => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('✅ WhatsApp webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    logger.warn('❌ Webhook verification failed - invalid token');
    res.sendStatus(403);
  }
};

// ─── WEBHOOK SIGNATURE VALIDATION ─────────────────────────
export const validateWebhookSignature = (req: Request): boolean => {
  const signature = req.headers['x-hub-signature-256'] as string;
  if (!signature) return false;

  const appSecret = process.env.WHATSAPP_APP_SECRET as string;
  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  const expected = `sha256=${expectedSignature}`;

  // Use timingSafeEqual to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
};

// ─── WEBHOOK MESSAGE HANDLER (POST) ───────────────────────
export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  // Always respond 200 immediately — Meta will retry if you don't
  res.sendStatus(200);

  // Validate signature
  if (!validateWebhookSignature(req)) {
    logger.warn('❌ Invalid webhook signature received');
    return;
  }

  const payload = req.body as WhatsAppWebhookPayload;

  // Confirm this is a WhatsApp webhook
  if (payload.object !== 'whatsapp_business_account') return;

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;

      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id;

      // Skip delivery status updates — only process actual messages
      if (!value.messages || value.messages.length === 0) continue;

      for (const message of value.messages) {
        await handleSingleMessage(message, phoneNumberId, value.contacts?.[0]?.profile?.name);
      }
    }
  }
};

// ─── PROCESS A SINGLE INCOMING MESSAGE ────────────────────
const handleSingleMessage = async (
  message: WhatsAppMessage,
  phoneNumberId: string,
  customerName?: string
): Promise<void> => {
  try {
    logger.info(`📩 Message received from ${message.from} | Type: ${message.type} | MsgID: ${message.id}`);

    // Find which tenant this WhatsApp number belongs to
    const tenant = await Tenant.findOne({
      whatsappPhoneNumberId: phoneNumberId,
      isActive: true,
    });

    if (!tenant) {
      logger.warn(`⚠️ No active tenant found for phone_number_id: ${phoneNumberId}`);
      return;
    }

    // Check subscription status — don't process if suspended
    if (tenant.subscriptionStatus === 'suspended' || tenant.subscriptionStatus === 'cancelled') {
      logger.warn(`⚠️ Tenant ${tenant.name} subscription is ${tenant.subscriptionStatus}. Skipping.`);
      return;
    }

    // Hand off to message processor
    await processIncomingMessage({
      message,
      tenant,
      customerName,
    });

  } catch (error) {
    logger.error(`❌ Error handling message from ${message.from}:`, error);
  }
};
