import logger from '../../utils/logger';
import { ITenant } from '../tenants/tenant.model';
import { WhatsAppMessage } from '../webhook/webhook.types';
import { Customer } from '../customers/customer.model';
import { Conversation, Message, IMessage, IConversation } from './conversation.model';
import { sendTextMessage, markMessageAsRead } from './whatsapp.sender';
import { generateAIReply } from '../ai/ai.service';
import { transcribeAudio } from '../voice/voice.service';
import { isHumanHandoffRequest, activateHumanTakeover } from './handoff.service';
import { needsPaymentLink } from '../ai/action.extractor';
import { Order } from '../orders/order.model';
import { initializePayment } from '../payments/payment.service';

interface ProcessMessageInput {
  message: WhatsAppMessage;
  tenant: ITenant;
  customerName?: string;
}

// ─── MAIN MESSAGE PROCESSOR ───────────────────────────────
export const processIncomingMessage = async ({
  message,
  tenant,
  customerName,
}: ProcessMessageInput): Promise<void> => {

  const customerPhone = message.from;

  // 1. Mark message as read (shows blue ticks to customer)
  await markMessageAsRead(tenant, message.id);

  // 2. Find or create customer record
  const customer = await findOrCreateCustomer(tenant, customerPhone, customerName);

  // 3. Check if customer is blocked
  if (customer.isBlocked) {
    logger.info(`🚫 Blocked customer ${customerPhone} tried to message ${tenant.name}`);
    return;
  }

  // 4. Find or create active conversation
  const conversation = await findOrCreateConversation(tenant, customer);

  // 5. Extract text content (handle voice notes)
  const textContent = await extractMessageContent(message, tenant);
  if (!textContent) {
    logger.warn(`⚠️ Could not extract content from message type: ${message.type}`);
    return;
  }

  // 6. Check if customer is requesting human handoff
  if (isHumanHandoffRequest(textContent)) {
    await saveMessage(conversation, message, 'customer', textContent);
    await activateHumanTakeover(
      tenant,
      conversation._id?.toString() as string,
      customerPhone,
      textContent
    );
    return;
  }

  // 7. If owner has taken over, don't let AI reply — just log the message
  if (conversation.isAgentPaused) {
    logger.info(`👤 Human takeover active for ${customerPhone}. AI skipped.`);
    await saveMessage(conversation, message, 'customer', textContent);
    return;
  }

  // 8. Save customer message to DB
  await saveMessage(conversation, message, 'customer', textContent);

  // 9. Load conversation history (last 10 messages for context)
  const history = await getConversationHistory(conversation._id as unknown as string, 10);

  // 10. Generate AI reply
  const aiReply = await generateAIReply({
    tenant,
    customerPhone,
    newMessage: textContent,
    history,
    conversation,
  });

  if (!aiReply) {
    logger.error(`❌ AI failed to generate reply for ${customerPhone}`);
    const fallback = "Sorry, I dey experience small issue. Please try again in a moment 🙏";
    await sendTextMessage(tenant, customerPhone, fallback);
    return;
  }

  // 11. Send AI reply to customer
  await sendTextMessage(tenant, customerPhone, aiReply);

  // 12. Save agent reply to DB
  await saveAgentMessage(conversation, aiReply);

  // 13. If AI mentioned sending a payment link, generate and send it
  if (needsPaymentLink(aiReply)) {
    await handlePaymentLinkRequest(tenant, conversation._id?.toString() as string, customerPhone);
  }

  // 14. Update conversation metadata
  await updateConversationMeta(conversation, textContent);

  logger.info(`✅ Processed message from ${customerPhone} → ${tenant.name}`);
};

// ─── PAYMENT LINK HANDLER ─────────────────────────────────
const handlePaymentLinkRequest = async (
  tenant: ITenant,
  conversationId: string,
  customerPhone: string
): Promise<void> => {
  try {
    const order = await Order.findOne({
      conversationId,
      paymentStatus: 'unpaid',
      status: 'awaiting_payment',
    }).sort({ createdAt: -1 });

    if (!order) {
      logger.warn(`⚠️ Payment link requested but no pending order for conversation ${conversationId}`);
      return;
    }

    const payment = await initializePayment(order, customerPhone);
    if (!payment) {
      await sendTextMessage(
        tenant,
        customerPhone,
        "Sorry, I had trouble generating your payment link. Please type 'HUMAN' to speak with us directly. 🙏"
      );
      return;
    }

    const paymentMsg =
      `💳 *Here's your secure payment link:*\n\n` +
      `${payment.authorizationUrl}\n\n` +
      `Amount: *₦${order.total.toLocaleString()}*\n\n` +
      `You can pay with card, bank transfer, or USSD 🔒\n\n` +
      `_Link expires in 30 minutes_`;

    await sendTextMessage(tenant, customerPhone, paymentMsg);
    logger.info(`💳 Payment link sent to ${customerPhone} for order ${order.orderNumber}`);

  } catch (error) {
    logger.error('❌ Failed to send payment link:', error);
  }
};

// ─── HELPERS ──────────────────────────────────────────────

const findOrCreateCustomer = async (tenant: ITenant, phone: string, name?: string) => {
  let customer = await Customer.findOne({ tenantId: tenant._id, phone });
  if (!customer) {
    customer = await Customer.create({
      tenantId: tenant._id,
      phone,
      name: name || undefined,
    });
    logger.info(`👤 New customer created: ${phone} for ${tenant.name}`);
  }
  return customer;
};

const findOrCreateConversation = async (tenant: ITenant, customer: InstanceType<typeof Customer>) => {
  const recentConvo = await Conversation.findOne({
    tenantId: tenant._id,
    customerId: customer._id,
    status: 'active',
    lastMessageAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  }).sort({ lastMessageAt: -1 });

  if (recentConvo) return recentConvo;

  const conversation = await Conversation.create({
    tenantId: tenant._id,
    customerId: customer._id,
    customerPhone: customer.phone,
  });

  logger.info(`💬 New conversation started for ${customer.phone}`);
  return conversation;
};

const extractMessageContent = async (
  message: WhatsAppMessage,
  tenant: ITenant
): Promise<string | null> => {
  switch (message.type) {
    case 'text':
      return message.text?.body || null;
    case 'audio':
      if (!message.audio?.id) return null;
      logger.info(`🎤 Transcribing voice note from ${message.from}`);
      const transcription = await transcribeAudio(tenant, message.audio.id);
      return transcription
        ? `[Voice note]: ${transcription}`
        : '[Customer sent a voice note that could not be transcribed]';
    case 'image':
      return message.image?.caption || '[Customer sent an image]';
    default:
      return `[Customer sent a ${message.type} message]`;
  }
};

const saveMessage = async (
  conversation: InstanceType<typeof Conversation>,
  message: WhatsAppMessage,
  role: 'customer' | 'agent' | 'owner',
  content: string
) => {
  await Message.create({
    conversationId: conversation._id,
    tenantId: conversation.tenantId,
    role,
    type: message.type === 'audio' ? 'audio' : message.type === 'image' ? 'image' : 'text',
    content,
    whatsappMessageId: message.id,
    rawMediaUrl: message.audio?.id || message.image?.id,
  });
};

const saveAgentMessage = async (
  conversation: InstanceType<typeof Conversation>,
  content: string
) => {
  await Message.create({
    conversationId: conversation._id,
    tenantId: conversation.tenantId,
    role: 'agent',
    type: 'text',
    content,
  });
};

const getConversationHistory = async (conversationId: unknown, limit: number): Promise<IMessage[]> => {
  const messages = await Message.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(limit);
  return messages.reverse();
};

const updateConversationMeta = async (
  conversation: InstanceType<typeof Conversation>,
  lastMessage: string
) => {
  await Conversation.findByIdAndUpdate(conversation._id, {
    lastMessageAt: new Date(),
    lastMessagePreview: lastMessage.substring(0, 100),
    $inc: { messageCount: 1 },
  });
};
