import mongoose, { Document, Schema } from 'mongoose';

export interface IMenuItem extends Document {
  tenantId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  price: number;           // in Naira
  category: string;        // e.g. "Mains", "Drinks", "Sides", "Proteins"
  imageUrl?: string;
  isAvailable: boolean;
  isPopular: boolean;
  allergens: string[];
  preparationTime: number; // in minutes
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const MenuItemSchema = new Schema<IMenuItem>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, required: true, trim: true },
    imageUrl: { type: String },
    isAvailable: { type: Boolean, default: true },
    isPopular: { type: Boolean, default: false },
    allergens: [{ type: String }],
    preparationTime: { type: Number, default: 15 },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

MenuItemSchema.index({ tenantId: 1, isAvailable: 1 });
MenuItemSchema.index({ tenantId: 1, category: 1 });

export const MenuItem = mongoose.model<IMenuItem>('MenuItem', MenuItemSchema);
