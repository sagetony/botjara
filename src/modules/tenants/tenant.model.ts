import mongoose, { Document, Schema } from 'mongoose';

export interface ITenant extends Document {
  name: string;
  whatsappNumber: string;         // The restaurant's WhatsApp number (with country code)
  whatsappPhoneNumberId: string;  // Meta phone number ID for API calls
  whatsappAccessToken: string;    // Meta access token for this number
  ownerPhone: string;             // Owner's personal WhatsApp for notifications
  businessAddress: string;
  description: string;
  openingHours: {
    monday: { open: string; close: string; isOpen: boolean };
    tuesday: { open: string; close: string; isOpen: boolean };
    wednesday: { open: string; close: string; isOpen: boolean };
    thursday: { open: string; close: string; isOpen: boolean };
    friday: { open: string; close: string; isOpen: boolean };
    saturday: { open: string; close: string; isOpen: boolean };
    sunday: { open: string; close: string; isOpen: boolean };
  };
  deliveryZones: string[];        // e.g. ["Wuse 2", "Maitama", "Garki"]
  deliveryFee: number;            // in Naira
  minimumOrder: number;           // minimum order amount in Naira
  estimatedDeliveryTime: string;  // e.g. "30-45 minutes"
  personality: string;            // AI personality descriptor e.g. "friendly, funny, speaks Pidgin"
  language: 'english' | 'pidgin' | 'yoruba' | 'hausa' | 'mixed';
  subscriptionStatus: 'trial' | 'active' | 'suspended' | 'cancelled';
  subscriptionPlan: 'starter' | 'growth' | 'pro';
  trialEndsAt: Date;
  isActive: boolean;
  paystackCustomerCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TenantSchema = new Schema<ITenant>(
  {
    name: { type: String, required: true, trim: true },
    whatsappNumber: { type: String, required: true, unique: true, trim: true },
    whatsappPhoneNumberId: { type: String, required: true },
    whatsappAccessToken: { type: String, required: true },
    ownerPhone: { type: String, required: true },
    businessAddress: { type: String, default: '' },
    description: { type: String, default: '' },
    openingHours: {
      monday: { open: { type: String, default: '09:00' }, close: { type: String, default: '22:00' }, isOpen: { type: Boolean, default: true } },
      tuesday: { open: { type: String, default: '09:00' }, close: { type: String, default: '22:00' }, isOpen: { type: Boolean, default: true } },
      wednesday: { open: { type: String, default: '09:00' }, close: { type: String, default: '22:00' }, isOpen: { type: Boolean, default: true } },
      thursday: { open: { type: String, default: '09:00' }, close: { type: String, default: '22:00' }, isOpen: { type: Boolean, default: true } },
      friday: { open: { type: String, default: '09:00' }, close: { type: String, default: '22:00' }, isOpen: { type: Boolean, default: true } },
      saturday: { open: { type: String, default: '10:00' }, close: { type: String, default: '23:00' }, isOpen: { type: Boolean, default: true } },
      sunday: { open: { type: String, default: '12:00' }, close: { type: String, default: '21:00' }, isOpen: { type: Boolean, default: true } },
    },
    deliveryZones: [{ type: String }],
    deliveryFee: { type: Number, default: 500 },
    minimumOrder: { type: Number, default: 1000 },
    estimatedDeliveryTime: { type: String, default: '30-45 minutes' },
    personality: { type: String, default: 'friendly, warm, speaks Pidgin when customer does' },
    language: { type: String, enum: ['english', 'pidgin', 'yoruba', 'hausa', 'mixed'], default: 'mixed' },
    subscriptionStatus: { type: String, enum: ['trial', 'active', 'suspended', 'cancelled'], default: 'trial' },
    subscriptionPlan: { type: String, enum: ['starter', 'growth', 'pro'], default: 'starter' },
    trialEndsAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    isActive: { type: Boolean, default: true },
    paystackCustomerCode: { type: String },
  },
  { timestamps: true }
);

TenantSchema.index({ whatsappNumber: 1 });
TenantSchema.index({ isActive: 1 });

export const Tenant = mongoose.model<ITenant>('Tenant', TenantSchema);
