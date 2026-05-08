// WhatsApp Cloud API incoming webhook payload types

export interface WhatsAppTextMessage {
  body: string;
}

export interface WhatsAppAudioMessage {
  id: string;
  mime_type: string;
}

export interface WhatsAppImageMessage {
  id: string;
  mime_type: string;
  sha256: string;
  caption?: string;
}

export interface WhatsAppMessage {
  id: string;
  from: string;   // customer phone number
  timestamp: string;
  type: 'text' | 'audio' | 'image' | 'document' | 'interactive' | 'button';
  text?: WhatsAppTextMessage;
  audio?: WhatsAppAudioMessage;
  image?: WhatsAppImageMessage;
  context?: { from: string; id: string };
}

export interface WhatsAppContact {
  profile: { name: string };
  wa_id: string;
}

export interface WhatsAppValue {
  messaging_product: string;
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: Array<{ id: string; status: string; timestamp: string; recipient_id: string }>;
}

export interface WhatsAppChange {
  value: WhatsAppValue;
  field: string;
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppEntry[];
}
