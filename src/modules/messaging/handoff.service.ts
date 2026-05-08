import { Conversation } from '../messaging/conversation.model';
import { notifyOwnerHumanRequest } from '../notifications/notification.service';
import { sendTextMessage } from '../messaging/whatsapp.sender';
import { ITenant } from '../tenants/tenant.model';
import logger from '../../utils/logger';

const HUMAN_TRIGGERS = [
  'human', 'talk to human', 'talk to owner', 'speak to owner',
  'speak to human', 'real person', 'owner', 'manager',
  'talk to someone', 'customer care', 'customer service',
];

// ─── CHECK IF MESSAGE IS A HUMAN HANDOFF REQUEST ──────────
export const isHumanHandoffRequest = (message: string): boolean => {
  const lower = message.toLowerCase().trim();
  return HUMAN_TRIGGERS.some((trigger) => lower.includes(trigger));
};

// ─── ACTIVATE HUMAN TAKEOVER ──────────────────────────────
export const activateHumanTakeover = async (
  tenant: ITenant,
  conversationId: string,
  customerPhone: string,
  lastMessage: string
): Promise<void> => {
  try {
    // Pause the AI for this conversation
    await Conversation.findByIdAndUpdate(conversationId, {
      status: 'human_takeover',
      isAgentPaused: true,
    });

    // Tell customer
    const customerMsg =
      `No wahala! 🙏 Let me connect you with ${tenant.name} directly.\n\n` +
      `They'll get back to you shortly. Please give them a moment!`;

    await sendTextMessage(tenant, customerPhone, customerMsg);

    // Alert the owner
    await notifyOwnerHumanRequest(tenant, customerPhone, lastMessage);

    logger.info(`👤 Human takeover activated for ${customerPhone} at ${tenant.name}`);

  } catch (error) {
    logger.error('❌ Failed to activate human takeover:', error);
  }
};

// ─── RESUME AI (owner hands back to bot) ─────────────────
export const resumeAI = async (conversationId: string): Promise<boolean> => {
  try {
    await Conversation.findByIdAndUpdate(conversationId, {
      status: 'active',
      isAgentPaused: false,
    });
    logger.info(`🤖 AI resumed for conversation ${conversationId}`);
    return true;
  } catch {
    return false;
  }
};

// ─── GET ALL PAUSED CONVERSATIONS ─────────────────────────
export const getPausedConversations = async (tenantId: string) => {
  return Conversation.find({
    tenantId,
    isAgentPaused: true,
    status: 'human_takeover',
  })
    .sort({ lastMessageAt: -1 })
    .populate('customerId', 'name phone')
    .lean();
};
