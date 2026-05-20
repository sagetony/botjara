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
      // Reminder injected as a system turn right before the response
      {
        role: "system",
        content: `REMINDER: If you are about to send a payment link in your next response, you MUST end your response with the ORDER_CONFIRMED tag containing the order JSON. No exceptions.`,
      },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 1200,
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

  return `You are the WhatsApp AI assistant for ${tenant.name}, a Nigerian food business.

PERSONALITY: ${tenant.personality}. Be warm, friendly. Use natural Nigerian English or Pidgin depending on customer. Add emojis naturally.

BUSINESS INFO:
- Name: ${tenant.name}
- Address: ${tenant.businessAddress}
- ${hoursText}
- Delivery zones: ${tenant.deliveryZones.join(", ")}
- Delivery fee: ₦${tenant.deliveryFee.toLocaleString()}
- Minimum order: ₦${tenant.minimumOrder.toLocaleString()}
- Estimated delivery time: ${tenant.estimatedDeliveryTime}

${menuContext}

ORDER FLOW:
1. Take the customer's order
2. Summarize items and total
3. Ask delivery or pickup
4. If delivery: get address, confirm zone, add delivery fee
5. Confirm final total
6. Say you are sending payment link

RULES:
- Never invent menu items or wrong prices
- Keep responses short — this is WhatsApp
- Never say you are an AI
- If customer says HUMAN or talk to owner: say "No wahala! Connecting you now 🙏"

===== MANDATORY PAYMENT TAG =====
THIS IS THE MOST IMPORTANT RULE.
When you send the payment link message (step 6), you MUST include this tag at the END of your response. The payment system WILL NOT WORK without it. This is not optional.

Example for pickup:
I go send you the payment link now. Hold on small! 🔗💰
<ORDER_CONFIRMED>{"items":[{"name":"Jollof Rice","quantity":1},{"name":"Chicken (1 piece)","quantity":1}],"type":"pickup"}</ORDER_CONFIRMED>

Example for delivery:
I go send you the payment link now. Hold on small! 🔗💰
<ORDER_CONFIRMED>{"items":[{"name":"Egusi Soup","quantity":1},{"name":"Eba (Large)","quantity":1}],"type":"delivery","deliveryAddress":"Wuse Zone 5"}</ORDER_CONFIRMED>

Replace items with the actual ordered items. Use exact menu item names.
ONLY include this tag when sending the payment link. Never for other messages.
===== END MANDATORY TAG =====`;
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
