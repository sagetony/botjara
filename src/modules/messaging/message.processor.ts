import logger from "../../utils/logger";
import { ITenant } from "../tenants/tenant.model";
import { WhatsAppMessage } from "../webhook/webhook.types";
import { Customer } from "../customers/customer.model";
import {
  Conversation,
  Message,
  IMessage,
  IConversation,
} from "./conversation.model";
import { sendTextMessage, markMessageAsRead } from "./whatsapp.sender";
import {
  generateAIReply,
  extractOrderFromReply,
  stripOrderTag,
} from "../ai/ai.service";
import { transcribeAudio } from "../voice/voice.service";
import {
  isHumanHandoffRequest,
  activateHumanTakeover,
} from "./handoff.service";
import { needsPaymentLink } from "../ai/action.extractor";
import { Order } from "../orders/order.model";
import { initializePayment } from "../payments/payment.service";
import { createOrder } from "../orders/order.service";

interface ProcessMessageInput {
  message: WhatsAppMessage;
  tenant: ITenant;
  customerName?: string;
}

export const processIncomingMessage = async ({
  message,
  tenant,
  customerName,
}: ProcessMessageInput): Promise<void> => {
  const customerPhone = message.from;

  await markMessageAsRead(tenant, message.id);

  const customer = await findOrCreateCustomer(
    tenant,
    customerPhone,
    customerName,
  );

  if (customer.isBlocked) {
    logger.info(`🚫 Blocked customer ${customerPhone}`);
    return;
  }

  const conversation = await findOrCreateConversation(tenant, customer);

  const textContent = await extractMessageContent(message, tenant);
  if (!textContent) {
    logger.warn(
      `⚠️ Could not extract content from message type: ${message.type}`,
    );
    return;
  }

  if (isHumanHandoffRequest(textContent)) {
    await saveMessage(conversation, message, "customer", textContent);
    await activateHumanTakeover(
      tenant,
      conversation._id?.toString() as string,
      customerPhone,
      textContent,
    );
    return;
  }

  if (conversation.isAgentPaused) {
    logger.info(`👤 Human takeover active for ${customerPhone}. AI skipped.`);
    await saveMessage(conversation, message, "customer", textContent);
    return;
  }

  await saveMessage(conversation, message, "customer", textContent);

  const history = await getConversationHistory(
    conversation._id as unknown as string,
    10,
  );

  const aiReply = await generateAIReply({
    tenant,
    customerPhone,
    newMessage: textContent,
    history,
    conversation,
  });

  if (!aiReply) {
    logger.error(`❌ AI failed to generate reply for ${customerPhone}`);
    const fallback =
      "Sorry, I dey experience small issue. Please try again in a moment 🙏";
    await sendTextMessage(tenant, customerPhone, fallback);
    return;
  }

  // Check if AI included ORDER_CONFIRMED tag
  const extractedOrder = extractOrderFromReply(aiReply);
  const cleanReply = stripOrderTag(aiReply);

  // Send clean reply to customer (without the hidden tag)
  await sendTextMessage(tenant, customerPhone, cleanReply);
  await saveAgentMessage(conversation, cleanReply);

  // If order was confirmed — save to DB and generate payment link
  if (extractedOrder) {
    logger.info(`📦 Order confirmed by AI for ${customerPhone}`);
    await handleOrderAndPayment(
      tenant,
      conversation,
      customer,
      extractedOrder,
      customerPhone,
    );
  } else if (needsPaymentLink(cleanReply)) {
    // Fallback: AI mentioned payment link but no order tag — try to find existing order
    await handlePaymentLinkRequest(
      tenant,
      conversation._id?.toString() as string,
      customerPhone,
    );
  }

  await updateConversationMeta(conversation, textContent);

  logger.info(`✅ Processed message from ${customerPhone} → ${tenant.name}`);
};

// ─── CREATE ORDER AND SEND PAYMENT LINK ──────────────────
const handleOrderAndPayment = async (
  tenant: ITenant,
  conversation: InstanceType<typeof Conversation>,
  customer: InstanceType<typeof Customer>,
  extractedOrder: {
    items: { name: string; quantity: number; modifiers?: string[] }[];
    type: "delivery" | "pickup";
    deliveryAddress?: string;
    notes?: string;
  },
  customerPhone: string,
): Promise<void> => {
  try {
    // Create order in DB
    const order = await createOrder({
      tenantId: tenant._id as unknown as import("mongoose").Types.ObjectId,
      customerId: customer._id as unknown as import("mongoose").Types.ObjectId,
      conversationId:
        conversation._id as unknown as import("mongoose").Types.ObjectId,
      items: extractedOrder.items,
      type: extractedOrder.type,
      deliveryAddress: extractedOrder.deliveryAddress,
      notes: extractedOrder.notes,
      deliveryFee: tenant.deliveryFee,
    });

    if (!order) {
      logger.error("❌ Failed to create order from AI extraction");
      await sendTextMessage(
        tenant,
        customerPhone,
        "Sorry, I had trouble saving your order. Please try again or type HUMAN to speak with us. 🙏",
      );
      return;
    }

    logger.info(
      `📦 Order saved: ${order.orderNumber} | Total: ₦${order.total.toLocaleString()}`,
    );

    // Generate Paystack payment link
    const payment = await initializePayment(order, customerPhone);

    if (!payment) {
      logger.error("❌ Failed to generate Paystack link");
      await sendTextMessage(
        tenant,
        customerPhone,
        "Sorry, I had trouble generating your payment link. Please type HUMAN to speak with us directly. 🙏",
      );
      return;
    }

    // Send payment link to customer
    const paymentMsg =
      `💳 *Here's your secure payment link:*\n\n` +
      `${payment.authorizationUrl}\n\n` +
      `Amount: *₦${order.total.toLocaleString()}*\n\n` +
      `You can pay with card, bank transfer, or USSD 🔒\n\n` +
      `_Link expires in 30 minutes_`;

    await sendTextMessage(tenant, customerPhone, paymentMsg);
    logger.info(
      `💳 Payment link sent to ${customerPhone} for order ${order.orderNumber}`,
    );
  } catch (error) {
    logger.error("❌ handleOrderAndPayment failed:", error);
  }
};

// ─── FALLBACK PAYMENT LINK (for existing orders) ─────────
const handlePaymentLinkRequest = async (
  tenant: ITenant,
  conversationId: string,
  customerPhone: string,
): Promise<void> => {
  try {
    const order = await Order.findOne({
      conversationId,
      paymentStatus: "unpaid",
      status: "awaiting_payment",
    }).sort({ createdAt: -1 });

    if (!order) {
      logger.warn(
        `⚠️ Payment link requested but no pending order for conversation ${conversationId}`,
      );
      return;
    }

    const payment = await initializePayment(order, customerPhone);
    if (!payment) {
      await sendTextMessage(
        tenant,
        customerPhone,
        "Sorry, I had trouble generating your payment link. Please type HUMAN to speak with us directly. 🙏",
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
    logger.info(
      `💳 Payment link sent to ${customerPhone} for order ${order.orderNumber}`,
    );
  } catch (error) {
    logger.error("❌ Failed to send payment link:", error);
  }
};

// ─── HELPERS ──────────────────────────────────────────────

const findOrCreateCustomer = async (
  tenant: ITenant,
  phone: string,
  name?: string,
) => {
  let customer = await Customer.findOne({ tenantId: tenant._id, phone });
  if (!customer) {
    customer = await Customer.create({
      tenantId: tenant._id,
      phone,
      name: name || undefined,
    });
    logger.info(`👤 New customer created: ${phone}`);
  }
  return customer;
};

const findOrCreateConversation = async (
  tenant: ITenant,
  customer: InstanceType<typeof Customer>,
) => {
  const recentConvo = await Conversation.findOne({
    tenantId: tenant._id,
    customerId: customer._id,
    status: "active",
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
  tenant: ITenant,
): Promise<string | null> => {
  switch (message.type) {
    case "text":
      return message.text?.body || null;
    case "audio":
      if (!message.audio?.id) return null;
      logger.info(`🎤 Transcribing voice note from ${message.from}`);
      const transcription = await transcribeAudio(tenant, message.audio.id);
      return transcription
        ? `[Voice note]: ${transcription}`
        : "[Customer sent a voice note that could not be transcribed]";
    case "image":
      return message.image?.caption || "[Customer sent an image]";
    default:
      return `[Customer sent a ${message.type} message]`;
  }
};

const saveMessage = async (
  conversation: InstanceType<typeof Conversation>,
  message: WhatsAppMessage,
  role: "customer" | "agent" | "owner",
  content: string,
) => {
  await Message.create({
    conversationId: conversation._id,
    tenantId: conversation.tenantId,
    role,
    type:
      message.type === "audio"
        ? "audio"
        : message.type === "image"
          ? "image"
          : "text",
    content,
    whatsappMessageId: message.id,
    rawMediaUrl: message.audio?.id || message.image?.id,
  });
};

const saveAgentMessage = async (
  conversation: InstanceType<typeof Conversation>,
  content: string,
) => {
  await Message.create({
    conversationId: conversation._id,
    tenantId: conversation.tenantId,
    role: "agent",
    type: "text",
    content,
  });
};

const getConversationHistory = async (
  conversationId: unknown,
  limit: number,
): Promise<IMessage[]> => {
  const messages = await Message.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(limit);
  return messages.reverse();
};

const updateConversationMeta = async (
  conversation: InstanceType<typeof Conversation>,
  lastMessage: string,
) => {
  await Conversation.findByIdAndUpdate(conversation._id, {
    lastMessageAt: new Date(),
    lastMessagePreview: lastMessage.substring(0, 100),
    $inc: { messageCount: 1 },
  });
};
