import { Router, Request, Response } from 'express';
import { verifyPaystackSignature, handlePaymentWebhook } from './payment.service';
import { Tenant } from '../tenants/tenant.model';
import { sendTextMessage } from '../messaging/whatsapp.sender';
import { Order } from '../orders/order.model';
import { notifyOwnerNewOrder } from '../notifications/notification.service';
import logger from '../../utils/logger';

const router = Router();

// POST /webhook/paystack — Paystack payment events
router.post('/paystack', async (req: Request, res: Response) => {
  // Always respond 200 immediately
  res.sendStatus(200);

  const signature = req.headers['x-paystack-signature'] as string;
  const rawBody = JSON.stringify(req.body);

  // Validate signature
  if (!verifyPaystackSignature(rawBody, signature)) {
    logger.warn('❌ Invalid Paystack webhook signature');
    return;
  }

  const { event, data } = req.body;
  logger.info(`💳 Paystack webhook received: ${event}`);

  const result = await handlePaymentWebhook(event, data);
  if (!result) return;

  const { orderId, tenantId, customerPhone } = result;

  try {
    // Get tenant to send WhatsApp message
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) return;

    const order = await Order.findById(orderId);
    if (!order) return;

    // 1. Notify customer — payment confirmed
    const customerMsg =
      `✅ *Payment confirmed!* Thank you!\n\n` +
      `Your order *${order.orderNumber}* has been received and we're getting started on it now 🍽️\n\n` +
      `Estimated time: *${order.estimatedTime}*\n\n` +
      `We'll let you know when it's ${order.type === 'delivery' ? 'on its way 🛵' : 'ready for pickup 🏃'}`;

    await sendTextMessage(tenant, customerPhone, customerMsg);

    // 2. Notify owner — new paid order
    await notifyOwnerNewOrder(tenant, order);

  } catch (error) {
    logger.error('❌ Error sending post-payment notifications:', error);
  }
});

export default router;
