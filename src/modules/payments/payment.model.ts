import mongoose, { Document, Schema } from 'mongoose';

export interface IPayment extends Document {
  tenantId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  paystackReference: string;
  paystackAccessCode?: string;
  paystackAuthorizationUrl?: string;
  amount: number;           // in kobo (Paystack uses kobo)
  amountNaira: number;      // in Naira (for display)
  currency: string;
  status: 'pending' | 'success' | 'failed' | 'abandoned' | 'refunded';
  channel?: string;         // e.g. "card", "bank_transfer", "ussd"
  paidAt?: Date;
  webhookData?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    paystackReference: { type: String, required: true, unique: true },
    paystackAccessCode: { type: String },
    paystackAuthorizationUrl: { type: String },
    amount: { type: Number, required: true },
    amountNaira: { type: Number, required: true },
    currency: { type: String, default: 'NGN' },
    status: { type: String, enum: ['pending', 'success', 'failed', 'abandoned', 'refunded'], default: 'pending' },
    channel: { type: String },
    paidAt: { type: Date },
    webhookData: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

PaymentSchema.index({ paystackReference: 1 });
PaymentSchema.index({ orderId: 1 });
PaymentSchema.index({ tenantId: 1, status: 1 });

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);
