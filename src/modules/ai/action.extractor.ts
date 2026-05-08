// The AI signals actions using special tags in its response
// We parse those tags and execute the corresponding actions

export interface AIAction {
  type: 'CREATE_ORDER' | 'SEND_PAYMENT_LINK' | 'HUMAN_HANDOFF' | 'UPDATE_STATUS';
  payload?: Record<string, unknown>;
}

// ─── EXTRACT ACTIONS FROM AI RESPONSE ────────────────────
// The AI wraps action signals in XML-style tags
// e.g. <ACTION:CREATE_ORDER>{"items": [...], "type": "delivery"}</ACTION>
export const extractActions = (response: string): { cleanText: string; actions: AIAction[] } => {
  const actions: AIAction[] = [];
  let cleanText = response;

  const actionRegex = /<ACTION:(\w+)>([\s\S]*?)<\/ACTION>/g;
  let match;

  while ((match = actionRegex.exec(response)) !== null) {
    const actionType = match[1] as AIAction['type'];
    const payloadStr = match[2].trim();

    try {
      const payload = payloadStr ? JSON.parse(payloadStr) : {};
      actions.push({ type: actionType, payload });
    } catch {
      actions.push({ type: actionType });
    }

    // Remove the action tag from the text shown to customer
    cleanText = cleanText.replace(match[0], '').trim();
  }

  return { cleanText, actions };
};

// ─── CHECK IF AI WANTS TO SEND A PAYMENT LINK ─────────────
export const needsPaymentLink = (response: string): boolean => {
  const triggers = [
    'send you a payment link',
    'sending you a payment link',
    'payment link now',
    'secure payment link',
    'pay via this link',
  ];
  const lower = response.toLowerCase();
  return triggers.some((t) => lower.includes(t));
};
