import mongoose, { Document, Schema } from 'mongoose';

export interface ICustomer extends Document {
  tenantId: mongoose.Types.ObjectId;
  phone: string;
  name?: string;
  defaultAddress?: string;
  totalOrders: number;
  totalSpent: number;      // in Naira
  lastOrderAt?: Date;
  isBlocked: boolean;
  notes?: string;          // internal notes by restaurant owner
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    phone: { type: String, required: true, trim: true },
    name: { type: String, trim: true },
    defaultAddress: { type: String },
    totalOrders: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    lastOrderAt: { type: Date },
    isBlocked: { type: Boolean, default: false },
    notes: { type: String },
  },
  { timestamps: true }
);

// Unique customer per restaurant
CustomerSchema.index({ tenantId: 1, phone: 1 }, { unique: true });

export const Customer = mongoose.model<ICustomer>('Customer', CustomerSchema);
