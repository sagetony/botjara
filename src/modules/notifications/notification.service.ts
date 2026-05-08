import logger from '../../utils/logger';
import { ITenant } from '../tenants/tenant.model';
import { IOrder } from '../orders/order.model';
import { sendTextMessage } from '../messaging/whatsapp.sender';

// ─── NOTIFY OWNER: NEW PAID ORDER ─────────────────────────
export const notifyOwnerNewOrder = async (
  tenant: ITenant,
  order: IOrder
): Promise<void> => {
  try {
    const itemsList = order.items
      .map((item) => {
        const modStr = item.modifiers.length > 0 ? ` (${item.modifiers.join(', ')})` : '';
        return `• ${item.quantity}x ${item.name}${modStr}`;
      })
      .join('\n');

    const msg =
      `🔔 *NEW ORDER — ${order.orderNumber}*\n\n` +
      `${itemsList}\n\n` +
      `─────────────\n` +
      `Total: *₦${order.total.toLocaleString()}* ✅ PAID\n` +
      `Type: ${order.type === 'delivery' ? '🛵 Delivery' : '🏃 Pickup'}\n` +
      (order.deliveryAddress ? `Address: ${order.deliveryAddress}\n` : '') +
      (order.notes ? `Notes: ${order.notes}\n` : '') +
      `\n_Update status on your dashboard_`;

    await sendTextMessage(tenant, tenant.ownerPhone, msg);
    logger.info(`📱 Owner notified for order ${order.orderNumber}`);

  } catch (error) {
    logger.error('❌ Failed to notify owner:', error);
  }
};

// ─── NOTIFY OWNER: HUMAN TAKEOVER REQUESTED ───────────────
export const notifyOwnerHumanRequest = async (
  tenant: ITenant,
  customerPhone: string,
  lastMessage: string
): Promise<void> => {
  try {
    const msg =
      `👤 *Customer wants to speak to you!*\n\n` +
      `Phone: ${customerPhone}\n` +
      `Last message: "${lastMessage.substring(0, 100)}"\n\n` +
      `Reply to them directly on WhatsApp or from your dashboard.`;

    await sendTextMessage(tenant, tenant.ownerPhone, msg);
    logger.info(`📱 Owner notified of human takeover request from ${customerPhone}`);

  } catch (error) {
    logger.error('❌ Failed to notify owner of human request:', error);
  }
};

// ─── NOTIFY CUSTOMER: ORDER STATUS UPDATE ─────────────────
export const notifyCustomerStatusUpdate = async (
  tenant: ITenant,
  customerPhone: string,
  orderNumber: string,
  status: string
): Promise<void> => {
  const statusMessages: Record<string, string> = {
    preparing: `👨‍🍳 Your order *${orderNumber}* is being prepared now! We'll notify you when it's ready.`,
    ready: `✅ Your order *${orderNumber}* is READY for pickup! Come get it 🏃`,
    dispatched: `🛵 Your order *${orderNumber}* is on its way! Our rider is heading to you now.`,
    delivered: `🎉 Your order *${orderNumber}* has been delivered! Enjoy your meal 😋\n\nThank you for ordering from ${tenant.name}!`,
    cancelled: `❌ Your order *${orderNumber}* has been cancelled. Please contact us if you have any questions.`,
  };

  const message = statusMessages[status];
  if (!message) return;

  try {
    await sendTextMessage(tenant, customerPhone, message);
    logger.info(`📱 Customer ${customerPhone} notified: order ${orderNumber} → ${status}`);
  } catch (error) {
    logger.error('❌ Failed to notify customer of status update:', error);
  }
};
