import mongoose, { Document, Schema } from 'mongoose';

// ─── CONVERSATION ──────────────────────────────────────────
export interface IConversation extends Document {
  tenantId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  customerPhone: string;
  status: 'active' | 'human_takeover' | 'resolved' | 'abandoned';
  currentOrderId?: mongoose.Types.ObjectId;
  lastMessageAt: Date;
  lastMessagePreview: string;
  messageCount: number;
  isAgentPaused: boolean;   // true when owner has taken over
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerPhone: { type: String, required: true },
    status: { type: String, enum: ['active', 'human_takeover', 'resolved', 'abandoned'], default: 'active' },
    currentOrderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    lastMessageAt: { type: Date, default: Date.now },
    lastMessagePreview: { type: String, default: '' },
    messageCount: { type: Number, default: 0 },
    isAgentPaused: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ConversationSchema.index({ tenantId: 1, customerPhone: 1 });
ConversationSchema.index({ tenantId: 1, status: 1 });
ConversationSchema.index({ lastMessageAt: -1 });

export const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema);

// ─── MESSAGE ───────────────────────────────────────────────
export interface IMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  role: 'customer' | 'agent' | 'owner';
  type: 'text' | 'audio' | 'image' | 'document' | 'system';
  content: string;                  // text content or transcription
  rawMediaUrl?: string;             // original WhatsApp media URL
  whatsappMessageId?: string;       // Meta message ID for deduplication
  metadata?: Record<string, unknown>; // any extra info (transcription confidence, etc)
  isRead: boolean;
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    role: { type: String, enum: ['customer', 'agent', 'owner'], required: true },
    type: { type: String, enum: ['text', 'audio', 'image', 'document', 'system'], default: 'text' },
    content: { type: String, required: true },
    rawMediaUrl: { type: String },
    whatsappMessageId: { type: String },
    metadata: { type: Schema.Types.Mixed },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ whatsappMessageId: 1 }, { sparse: true, unique: true });

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
