import OpenAI from "openai";
import logger from "../../utils/logger";
import { ITenant } from "../tenants/tenant.model";
import { MenuItem } from "../menus/menu.model";
import { IMessage, IConversation } from "../messaging/conversation.model";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface GenerateReplyInput {
  tenant: ITenant;
  customerPhone: string;
  newMessage: string;
  history: IMessage[];
  conversation: IConversation;
}

export interface ExtractedOrder {
  items: { name: string; quantity: number; modifiers?: string[] }[];
  type: "delivery" | "pickup";
  deliveryAddress?: string;
  notes?: string;
}

export const generateAIReply = async ({
  tenant,
  customerPhone,
  newMessage,
  history,
  conversation,
}: GenerateReplyInput): Promise<string | null> => {
  try {
    const menuContext = await buildMenuContext(tenant);
    const systemPrompt = buildSystemPrompt(tenant, menuContext);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...history.map((msg) => ({
        role: (msg.role === "customer" ? "user" : "assistant") as
          | "user"
          | "assistant",
        content: msg.content,
      })),
      { role: "user", content: newMessage },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 800,
      temperature: 0.7,
    });

    const reply = response.choices[0]?.message?.content?.trim();
    if (!reply) return null;

    logger.debug(
      `🤖 AI reply generated for ${customerPhone}: ${reply.substring(0, 80)}...`,
    );
    return reply;
  } catch (error) {
    logger.error("❌ OpenAI API error:", error);
    return null;
  }
};

export const extractOrderFromReply = (reply: string): ExtractedOrder | null => {
  const match = reply.match(/<ORDER_CONFIRMED>([\s\S]*?)<\/ORDER_CONFIRMED>/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1].trim());
    return parsed as ExtractedOrder;
  } catch (error) {
    logger.error("❌ Failed to parse ORDER_CONFIRMED tag:", error);
    return null;
  }
};

export const stripOrderTag = (reply: string): string => {
  return reply
    .replace(/<ORDER_CONFIRMED>[\s\S]*?<\/ORDER_CONFIRMED>/g, "")
    .trim();
};

const buildSystemPrompt = (tenant: ITenant, menuContext: string): string => {
  const today = new Date();
  const dayName = today
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase() as keyof typeof tenant.openingHours;
  const hours = tenant.openingHours[dayName];
  const hoursText = hours.isOpen
    ? `Today we are open from ${hours.open} to ${hours.close}`
    : `We are closed today`;

  return `You are the WhatsApp AI assistant for ${tenant.name}, a Nigerian food business. Your job is to help customers order food, answer questions, and provide excellent service.

PERSONALITY: ${tenant.personality}. Be warm, friendly, and human. Use natural Nigerian English. If the customer writes in Pidgin, respond in Pidgin. If they write in proper English, match that energy. Add appropriate emojis to feel natural, not robotic.

BUSINESS INFO:
- Name: ${tenant.name}
- Address: ${tenant.businessAddress}
- ${hoursText}
- Delivery zones: ${tenant.deliveryZones.join(", ") || "Ask customer for address and confirm"}
- Delivery fee: ₦${tenant.deliveryFee.toLocaleString()}
- Minimum order: ₦${tenant.minimumOrder.toLocaleString()}
- Estimated delivery time: ${tenant.estimatedDeliveryTime}

${menuContext}

ORDER TAKING RULES:
1. When customer wants to order, collect their full order first
2. Summarize the order with itemized prices and total (include delivery fee if delivery)
3. Ask: "Delivery or pickup?"
4. If delivery: collect their address, confirm it's within delivery zone
5. Confirm the final total with delivery fee included
6. Tell them you will send a payment link

PAYMENT:
- After order is confirmed and you are about to send the payment link, say: "Great! I go send you the payment link now. Hold on small!"
- The system will automatically generate and send the real Paystack payment link
- If customer asks about payment methods: we accept card, bank transfer, and USSD

CRITICAL — ORDER CONFIRMATION SIGNAL:
When the customer has confirmed their order AND you are sending the payment link message, you MUST append this hidden tag at the very end of your response. This is how the system saves the order and generates the real payment link. DO NOT skip this.

Format exactly like this (replace with actual order details):
<ORDER_CONFIRMED>
{
  "items": [
    {"name": "Jollof Rice", "quantity": 2},
    {"name": "Chicken (1 piece)", "quantity": 1, "modifiers": ["extra spicy"]}
  ],
  "type": "delivery",
  "deliveryAddress": "15 Wuse Zone 5"
}
</ORDER_CONFIRMED>

For pickup orders use "type": "pickup" and omit deliveryAddress.
Only include this tag ONCE when you first send the payment link message.
Do NOT include it for any other message.

IMPORTANT RULES:
- NEVER make up menu items that aren't listed
- NEVER quote wrong prices — always use the prices from the menu
- If an item is marked unavailable, apologize and suggest alternatives
- If customer asks for something not on the menu, politely say it is not available today
- If customer seems frustrated or has a complaint, be empathetic and offer to connect them with the owner
- To connect with a human: tell customer to type HUMAN or talk to human
- Keep responses concise — this is WhatsApp, not email
- Never mention that you are an AI unless directly asked

HUMAN HANDOFF:
If customer types HUMAN, talk to human, owner, manager, or similar — respond: "No wahala! Let me connect you with the owner right away. They will get back to you shortly." Then the system handles the rest.`;
};

const buildMenuContext = async (tenant: ITenant): Promise<string> => {
  const items = await MenuItem.find({ tenantId: tenant._id })
    .sort({ category: 1, sortOrder: 1 })
    .lean();

  if (items.length === 0) return "MENU: (No menu items configured yet)";

  const grouped: Record<string, typeof items> = {};
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  let menuText = "MENU:\n";
  for (const [category, categoryItems] of Object.entries(grouped)) {
    menuText += `\n${category.toUpperCase()}:\n`;
    for (const item of categoryItems) {
      const availability = item.isAvailable ? "" : " [UNAVAILABLE TODAY]";
      const popular = item.isPopular ? " ⭐" : "";
      menuText += `- ${item.name}${popular}: ₦${item.price.toLocaleString()}${availability}`;
      if (item.description) menuText += ` (${item.description})`;
      menuText += "\n";
    }
  }

  return menuText;
};
