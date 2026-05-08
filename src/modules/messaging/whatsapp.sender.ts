import axios from 'axios';
import logger from '../../utils/logger';
import { ITenant } from '../tenants/tenant.model';

const WA_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v18.0';
const WA_BASE_URL = process.env.WHATSAPP_BASE_URL || 'https://graph.facebook.com';

// ─── SEND TEXT MESSAGE ─────────────────────────────────────
export const sendTextMessage = async (
  tenant: ITenant,
  toPhone: string,
  message: string
): Promise<boolean> => {
  try {
    const url = `${WA_BASE_URL}/${WA_API_VERSION}/${tenant.whatsappPhoneNumberId}/messages`;

    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'text',
        text: { preview_url: false, body: message },
      },
      {
        headers: {
          Authorization: `Bearer ${tenant.whatsappAccessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.debug(`✅ Message sent to ${toPhone}`);
    return true;

  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      logger.error(`❌ Failed to send message to ${toPhone}:`, error.response?.data || error.message);
    }
    return false;
  }
};

// ─── MARK MESSAGE AS READ ─────────────────────────────────
export const markMessageAsRead = async (
  tenant: ITenant,
  messageId: string
): Promise<void> => {
  try {
    const url = `${WA_BASE_URL}/${WA_API_VERSION}/${tenant.whatsappPhoneNumberId}/messages`;
    await axios.post(
      url,
      { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
      { headers: { Authorization: `Bearer ${tenant.whatsappAccessToken}`, 'Content-Type': 'application/json' } }
    );
  } catch {
    // Non-critical — don't throw
  }
};

// ─── DOWNLOAD MEDIA (for voice notes / images) ────────────
export const downloadMedia = async (
  tenant: ITenant,
  mediaId: string
): Promise<{ url: string; mimeType: string } | null> => {
  try {
    const url = `${WA_BASE_URL}/${WA_API_VERSION}/${mediaId}`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${tenant.whatsappAccessToken}` },
    });

    return {
      url: response.data.url,
      mimeType: response.data.mime_type,
    };
  } catch (error) {
    logger.error(`❌ Failed to get media URL for ${mediaId}:`, error);
    return null;
  }
};

// ─── SEND TYPING INDICATOR ────────────────────────────────
// Shows "typing..." to customer while AI processes
export const sendTypingIndicator = async (
  tenant: ITenant,
  toPhone: string,
  messageId: string
): Promise<void> => {
  // Mark as read first (this shows blue ticks and hides typing)
  await markMessageAsRead(tenant, messageId);
  // Note: WhatsApp Cloud API doesn't support typing indicators directly
  // Reading the message achieves a similar psychological effect
};

// ─── FORMAT PHONE NUMBER ──────────────────────────────────
// Ensure phone number has country code, no + or spaces
export const formatPhone = (phone: string): string => {
  return phone.replace(/\D/g, '').replace(/^0/, '234');
};
