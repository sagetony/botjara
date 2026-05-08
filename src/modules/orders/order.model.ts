import mongoose, { Document, Schema } from 'mongoose';

export interface IOrderItem {
  menuItemId: mongoose.Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
  modifiers: string[];   // e.g. ["no pepper", "extra meat"]
  subtotal: number;
}

export interface IOrder extends Document {
  tenantId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  orderNumber: string;               // human-readable e.g. "ORD-0042"
  items: IOrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  type: 'delivery' | 'pickup';
  deliveryAddress?: string;
  pickupTime?: string;
  estimatedTime: string;
  status: 'pending' | 'awaiting_payment' | 'paid' | 'preparing' | 'ready' | 'dispatched' | 'delivered' | 'cancelled';
  paymentStatus: 'unpaid' | 'paid' | 'refunded';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    menuItemId: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    modifiers: [{ type: String }],
    subtotal: { type: Number, required: true },
  },
  { _id: false }
);

const OrderSchema = new Schema<IOrder>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    orderNumber: { type: String, required: true, unique: true },
    items: [OrderItemSchema],
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    total: { type: Number, required: true },
    type: { type: String, enum: ['delivery', 'pickup'], required: true },
    deliveryAddress: { type: String },
    pickupTime: { type: String },
    estimatedTime: { type: String, default: '30-45 minutes' },
    status: {
      type: String,
      enum: ['pending', 'awaiting_payment', 'paid', 'preparing', 'ready', 'dispatched', 'delivered', 'cancelled'],
      default: 'pending'
    },
    paymentStatus: { type: String, enum: ['unpaid', 'paid', 'refunded'], default: 'unpaid' },
    notes: { type: String },
  },
  { timestamps: true }
);

OrderSchema.index({ tenantId: 1, status: 1 });
OrderSchema.index({ tenantId: 1, createdAt: -1 });
OrderSchema.index({ conversationId: 1 });

// Auto-generate order number before saving
OrderSchema.pre('save', async function (next) {
  if (this.isNew) {
    const count = await mongoose.model('Order').countDocuments({ tenantId: this.tenantId });
    this.orderNumber = `ORD-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

export const Order = mongoose.model<IOrder>('Order', OrderSchema);
